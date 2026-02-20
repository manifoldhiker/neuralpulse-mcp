# GitHub Data Ingestion Research

## Context in this repo

`neuralpulse-mcp` currently ingests RSS/Atom via `rss-parser`, normalizes to a simple item shape (`title`, `link`, `published`, `source`, `snippet`), and returns raw text through the MCP tool `get_feed`.

GitHub ingestion should follow the same principle: fetch and normalize raw GitHub activity/events/content into feed-like items, then let the AI assistant summarize.

## What "GitHub ingestion" can mean

There are 3 practical ingestion classes:

1. **Repository content updates**: releases, tags, commits, changelog files.
2. **Collaboration activity**: issues, PRs, comments, discussions.
3. **Ecosystem-wide trend data**: public event firehose for discovery/ranking.

Different GitHub data sources are better for different classes.

## Data source options

### 1) GitHub REST API (polling + incremental sync)

Best for straightforward endpoint access and predictable pagination.

- **Strengths**
  - Very broad coverage of resources and webhook admin APIs.
  - Easy incremental sync with `since` filters, pagination, and ETag/`If-None-Match`.
  - Great fit for per-repo signals (releases, issues, PRs, commits).
- **Constraints**
  - Primary + secondary rate limits.
  - Polling-heavy designs can hit limits and add latency.
- **Best use in this project**
  - MVP ingestion for selected repos/topics.
  - Backfill and reconciliation jobs even if webhooks are added later.

### 2) GitHub GraphQL API

Best for highly selective fetches spanning multiple related entities.

- **Strengths**
  - Fetch exactly needed fields and relationships in fewer round-trips.
  - Can reduce client orchestration complexity for nested data.
- **Constraints**
  - Point-cost model and node limits require careful query design.
  - Complex queries can timeout; must keep depth/width tight.
- **Best use in this project**
  - Enrichment layer (e.g., fetch PR + reviews + labels + linked issues in one request).
  - Not required for MVP ingestion.

### 3) GitHub Webhooks (event-driven ingest)

Best for near-real-time updates without aggressive polling.

- **Strengths**
  - Low latency, lower API pressure.
  - Aligns with GitHub guidance to avoid polling where possible.
- **Constraints**
  - Requires public webhook receiver (or relay), signature validation, idempotency.
  - GitHub does **not** auto-redeliver failed deliveries; you must implement recovery.
  - Receiver must ACK within 10 seconds; processing should be async.
- **Best use in this project**
  - Phase 2+ for production-grade freshness.
  - Use together with periodic REST reconciliation.

### 4) Events API (public activity endpoints)

Best for short-window public event feeds, not long-term history.

- **Key limitation**
  - Retention window reduced to **30 days** (changed from 90 days in 2025).
- **Best use in this project**
  - Lightweight "recent public activity" signal.
  - Not suitable as a sole historical source.

### 5) GH Archive / BigQuery public datasets

Best for large-scale historical/public analytics and trend mining.

- **Strengths**
  - Multi-year public GitHub event history.
  - Good for offline ranking/discovery pipelines.
- **Constraints**
  - Not official low-latency transactional API for private/user-specific data.
  - Requires data warehouse workflow.
- **Best use in this project**
  - Optional future "discovery engine" (e.g., identify rising repos/topics).

## Auth model recommendations

Preferred auth order:

1. **GitHub App installation token** (recommended default for production)
   - Better isolation and permission scoping.
   - Stronger scaling behavior vs single user PAT.
2. **Fine-grained PAT** (fastest for local MVP)
   - Simpler setup.
   - Shared user quota; less ideal for multi-user server deployments.
3. **Unauthenticated** only for experiments
   - 60 req/hour is generally too low.

## Rate limits and operational implications

High-level limits to design around:

- REST authenticated user: typically `5000` req/hour.
- REST GitHub App installation: `5000` req/hour base, can scale by repos/users (cap `12500`, higher in Enterprise Cloud).
- GraphQL: point-based budgets (commonly `5000` points/hour for users/installations; installation scaling rules apply).
- Secondary limits: concurrency and burst controls apply across REST/GraphQL.

Design implications:

- Add a per-source request queue and global concurrency cap.
- Use ETag conditional GETs to reduce unnecessary cost (`304` responses).
- Track and respect `x-ratelimit-*` headers, plus `retry-after` on throttling.
- Use exponential backoff with jitter on 403/429 responses.

## Recommended architecture for neuralpulse-mcp

### Phase 1 (MVP in this repo)

Goal: ship GitHub as an additional feed source without webhooks.

- Add `github-sources.json` config with entries like:
  - `owner/repo`
  - source type (`releases`, `issues`, `pulls`, `commits`)
  - optional labels/filters
- Implement REST polling modules:
  - fetch latest items per source
  - incremental cursors (`updated_at`, last seen ID, ETag)
  - normalization to existing feed item shape
- Merge with existing RSS items in `get_feed` pipeline.
- Cache responses in local state (file or lightweight DB) to avoid duplicate work.

### Phase 2 (production-grade freshness)

Goal: lower latency and API pressure.

- Register GitHub App + webhook endpoint.
- Verify `X-Hub-Signature-256`.
- Persist dedupe key (`X-GitHub-Delivery` + event payload ID).
- ACK fast, push payload to queue for async normalization.
- Add scheduled failed-delivery redelivery + reconciliation poller.

### Phase 3 (advanced discovery)

Goal: power "what is trending for my interests?" features.

- Ingest GH Archive / BigQuery aggregates offline.
- Blend global trend signals with user subscriptions.

## Normalization strategy

Map GitHub entities to the current `FeedItem` interface:

- `title`: human-readable event title
  - examples: `Release v1.8.2 in owner/repo`, `PR #431 merged: Improve parser backoff`
- `link`: canonical GitHub URL (`html_url`)
- `published`: `created_at`/`published_at`/event timestamp
- `source`: stable source label (e.g., `github:owner/repo`)
- `snippet`: compact summary from body/commit message/release notes (trimmed)

Add optional metadata internally (not necessarily exposed in text):

- `kind` (`release|pr|issue|commit|discussion|event`)
- `repo`
- `author`
- `labels`
- `action` (opened/closed/merged/released/etc.)

## Minimum viable endpoint set

For a pragmatic first release, start with:

- Repos: releases, commits.
- Collaboration: pull requests, issues.
- Optional: discussions (if target communities use them heavily).

Skip initially:

- Code search ingestion as primary source (result/indexing constraints).
- Events API as core history backbone (30-day retention ceiling).

## Reliability and security checklist

- Use least-privilege app permissions/scopes only.
- Never store tokens in repo; load from env/secret manager.
- Validate webhook signatures and reject mismatches.
- Idempotent processing keyed by delivery/event IDs.
- Queue-based processing with dead-letter handling.
- Periodic reconciliation poll to repair missed events.
- Structured observability: ingestion lag, dropped events, rate-limit errors, redelivery success.

## Proposed implementation shape in this codebase

- New modules
  - `src/github/config.ts`
  - `src/github/client.ts` (auth, retry, pagination, rate-limit handling)
  - `src/github/pollers.ts` (endpoint-specific fetchers)
  - `src/github/normalize.ts` (GitHub -> `FeedItem`)
  - `src/github/state.ts` (cursor/etag persistence)
- Integrate in existing feed path
  - extend `getFeed()` to pull RSS + GitHub and perform unified sort/limit.
- Optional new MCP tool
  - `get_github_feed` for targeted debugging before full merge.

## Recommended decision

For this project now: **build Phase 1 with REST polling + ETag + cursor state**, then add **GitHub App webhooks** once requirements demand fresher updates and lower API spend.

This keeps implementation complexity aligned with current repo size, while preserving a clear path to production-grade ingestion.

## Research references

- GitHub REST API rate limits:
  - https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- GitHub GraphQL rate/query limits:
  - https://docs.github.com/en/graphql/overview/rate-limits-and-node-limits-for-the-graphql-api
- REST API best practices (polling, conditional requests):
  - https://docs.github.com/en/rest/guides/best-practices-for-using-the-rest-api
- Webhook best practices:
  - https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
- Failed delivery handling (no auto redelivery):
  - https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries
- Events API retention change (30 days):
  - https://github.blog/changelog/2024-11-08-upcoming-changes-to-data-retention-for-events-api-atom-feed-timeline-and-dashboard-feed-features
- GH Archive:
  - https://www.gharchive.org/
