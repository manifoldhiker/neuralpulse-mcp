# NeuralPulse MCP

Personalized content feed served through any AI assistant via MCP.

An MCP server that aggregates content from multiple source types (RSS, YouTube, GitHub) into a unified feed. Summarization happens on the AI assistant side.

## Supported Channel Types

- **RSS / Atom Feed** — subscribe to any RSS or Atom feed by URL
- **YouTube Podcast / Channel** — subscribe to a YouTube channel's uploads
- **GitHub Repository Tracker** — track releases, commits, PRs, and issues

## Setup

```bash
npm install
```

## Run in Cursor

The repo includes `.cursor/mcp.json` which registers the server automatically. After `npm install`, restart Cursor (or reload MCP servers) and the `neuralpulse` server will appear.

You can then ask your AI assistant things like:
- "Give me my morning briefing"
- "What's new in AI?"
- "Subscribe me to 3Blue1Brown on YouTube"
- "Track releases for modelcontextprotocol/typescript-sdk on GitHub"
- "What channel types are available?"

## MCP Tools

### Feed

- **`get_feed`** — query the unified feed with filters (limit, channel_ids, channel_types, tags, query, since)

### Introspection

- **`get_channel_types`** — list all supported channel types with config schemas

### Channel Management

- **`list_channels`** — list configured channels with sync status
- **`create_channel`** — add a new channel (validates, persists, initial sync)
- **`update_channel`** — update name, config, tags, or enabled state
- **`delete_channel`** — remove a channel and its cached items
- **`sync_channel`** — force an immediate refresh

## Build

```bash
npm run build
```

## Run standalone (for testing)

```bash
npm run dev
```

## Architecture

```
src/
  index.ts                 — server bootstrap + adapter registration
  core/
    types.ts               — domain types (NormalizedItem, InfoChannel, ChannelAdapter, etc.)
    feed-service.ts        — FeedService orchestrator
    sync-coordinator.ts    — background + on-demand sync with concurrency control
    adapter-registry.ts    — pluggable adapter registry
  stores/
    channel-store.ts       — channel config persistence (JSON)
    item-store.ts          — in-memory item store with query/filter
    sync-state-store.ts    — sync cursor/state persistence (JSON)
  adapters/
    rss.ts                 — RSS/Atom adapter
    youtube-podcast.ts     — YouTube channel adapter (Atom feed)
    github-trends.ts       — GitHub repo tracker (REST API)
  mcp/
    tools.ts               — MCP tool definitions
    render.ts              — text rendering for MCP responses
```

Adding a new channel type: implement `ChannelAdapter`, call `registry.register()`. Zero changes to core.
