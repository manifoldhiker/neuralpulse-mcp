# NeuralPulse MCP — Architecture Diagram

## System Overview

```mermaid
flowchart TD
    %% ─── External Sources ───────────────────────────────────────
    subgraph EXT["🌐 External Sources"]
        RSS["RSS / Atom Feeds\n(any URL)"]
        YT["YouTube Channels\n(Atom feed API)"]
        GH["GitHub Repositories\nAPI v2022-11-28\n(releases · commits · PRs · issues)"]
    end

    %% ─── Adapter Layer ──────────────────────────────────────────
    subgraph ADAPT["⚙️ Adapter Layer  (src/adapters/)"]
        RA["RssAdapter\nTTL 5 min · concurrency 10"]
        YA["YouTubePodcastAdapter\nTTL 15 min · concurrency 5"]
        GA["GitHubTrendsAdapter\nTTL 10 min · concurrency 2\nETag + rate-limit headers"]
        AR["AdapterRegistry\n(describeAll · get · register)"]
    end

    RSS -->|parseURL| RA
    YT  -->|Atom XML| YA
    GH  -->|REST + Bearer token| GA
    RA & YA & GA --> AR

    %% ─── Sync Engine ─────────────────────────────────────────────
    subgraph SYNC["🔄 SyncCoordinator  (src/core/sync-coordinator.ts)"]
        direction TB
        BG["Background Ticker\nevery 30 s"]
        SEM["Semaphores\nglobal max 8\nper-adapter max"]
        RATE["Rate Budget Tracker\nthreshold · resetAt"]
        BACK["Exponential Backoff\nmax 30 min"]
        PIPE["syncOne pipeline\nstaleness check → acquire sem\n→ adapter.sync() → upsert items\n→ save SyncState"]
        BG --> PIPE
        SEM --> PIPE
        RATE --> PIPE
        BACK --> PIPE
    end

    AR --> SYNC

    %% ─── Storage ────────────────────────────────────────────────
    subgraph STORE["🗄️ Storage  (src/stores/)"]
        CS["JsonChannelStore\ndata/channels.json\n(persistent · CRUD)"]
        IS["InMemoryItemStore\nMap keyed by item ID\n(upsert · query · prune)"]
        SS["JsonSyncStateStore\ndata/sync-state.json\n(cursor · lastSyncAt · failures)"]
    end

    SYNC -->|upsert NormalizedItem| IS
    SYNC -->|read/write SyncState| SS
    SYNC -->|list enabled channels| CS

    %% ─── Core Service ────────────────────────────────────────────
    subgraph CORE["🧠 FeedService  (src/core/feed-service.ts)"]
        GF["getFeed(query)\nfilter channels → ensureFresh\n→ ItemStore.query()"]
        CH["Channel CRUD\ncreate · update · delete · list"]
        SC["syncChannel(id)\nforce refresh on demand"]
    end

    CS --> CORE
    IS --> CORE
    SYNC --> CORE

    %% ─── MCP Server ──────────────────────────────────────────────
    subgraph MCP["🔌 MCP Server  (src/mcp/)"]
        SRV["McpServer\nneuralpulse v2.0.0"]
        TR["StdioServerTransport"]
        subgraph TOOLS["Tools (src/mcp/tools.ts)"]
            T1["get_feed\nlimit · channel_ids · types\ntags · query · since"]
            T2["get_channel_types"]
            T3["list_channels"]
            T4["create_channel"]
            T5["update_channel"]
            T6["delete_channel"]
            T7["sync_channel"]
        end
        SRV --- TR
        SRV --- TOOLS
    end

    CORE --> MCP

    %% ─── AI Client ───────────────────────────────────────────────
    subgraph CLIENT["🤖 MCP Host / AI Client"]
        CL["Claude · Cursor · any MCP client"]
    end

    TR <-->|"JSON-RPC over stdio"| CL

    %% ─── Briefing Pipeline ───────────────────────────────────────
    subgraph BRIEF["📧 Morning Briefing  (src/briefing.ts)"]
        CRON["node-cron\ndefault: 0 7 * * *"]
        SUM["summarizeItems()\nAnthropic API → claude-sonnet-4-6\nmax_tokens 1024"]
        MAIL["sendBriefing()\nNodemailer → Gmail SMTP\nGMAIL_USER + APP_PASSWORD"]
        CRON -->|"getFeed(limit:30)"| IS
        IS -->|NormalizedItems| SUM
        SUM -->|AI digest text| MAIL
    end

    CORE -.->|shares ItemStore| BRIEF

    %% ─── Config / Env ────────────────────────────────────────────
    subgraph ENV["🔐 Environment / Config"]
        E1["ANTHROPIC_API_KEY"]
        E2["GMAIL_USER + GMAIL_APP_PASSWORD"]
        E3["BRIEFING_RECIPIENT"]
        E4["BRIEFING_CRON (optional)"]
        E5["GITHUB_TOKEN (optional)"]
    end

    ENV -.->|injected at runtime| BRIEF
    ENV -.->|injected at runtime| GA

    %% ─── Styling ─────────────────────────────────────────────────
    classDef external  fill:#1a1a2e,stroke:#e94560,color:#fff
    classDef adapter   fill:#16213e,stroke:#0f3460,color:#a8d8ea
    classDef sync      fill:#0f3460,stroke:#533483,color:#fff
    classDef store     fill:#533483,stroke:#e94560,color:#fff
    classDef core      fill:#e94560,stroke:#f5a623,color:#fff
    classDef mcp       fill:#f5a623,stroke:#fff,color:#000
    classDef client    fill:#2d6a4f,stroke:#52b788,color:#fff
    classDef brief     fill:#1b4332,stroke:#52b788,color:#fff
    classDef env       fill:#2c2c2c,stroke:#888,color:#ccc

    class RSS,YT,GH external
    class RA,YA,GA,AR adapter
    class BG,SEM,RATE,BACK,PIPE sync
    class CS,IS,SS store
    class GF,CH,SC core
    class SRV,TR,T1,T2,T3,T4,T5,T6,T7 mcp
    class CL client
    class CRON,SUM,MAIL brief
    class E1,E2,E3,E4,E5 env
```

---

## Component Reference

| Layer | Component | Role |
|---|---|---|
| **External** | RSS/Atom, YouTube, GitHub API | Content sources |
| **Adapters** | RssAdapter, YouTubePodcastAdapter, GitHubTrendsAdapter | Normalize raw data → `NormalizedItem` |
| **Registry** | AdapterRegistry | Lookup & introspection |
| **Sync Engine** | SyncCoordinator | Concurrency control, TTL, backoff, rate limits |
| **Storage** | JsonChannelStore, InMemoryItemStore, JsonSyncStateStore | Persist channels & sync state; cache items |
| **Core** | FeedService | Orchestrate CRUD + query pipeline |
| **MCP** | McpServer + 7 Tools | Expose everything over MCP stdio protocol |
| **Briefing** | node-cron + Claude API + Nodemailer | Scheduled daily email digest |

## Data Flow (query path)

```
AI Client
  → MCP tool call (get_feed)
    → FeedService.getFeed()
      → SyncCoordinator.ensureFresh()   ← lazy refresh if stale
        → Adapter.sync()                ← fetch from external source
          → InMemoryItemStore.upsert()
      → InMemoryItemStore.query()       ← filter · sort · limit
    → renderFeedItems()
  ← JSON-RPC response (text)
```

## Data Flow (briefing path)

```
node-cron (07:00)
  → getFeed({ limit: 30 })             ← reads InMemoryItemStore
  → summarizeItems() via Claude API    ← AI narrative digest
  → sendBriefing() via Gmail SMTP      ← email to recipient
```
