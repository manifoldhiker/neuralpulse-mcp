# YouTube Podcast Ingestion Research

Date: 2026-02-20

## Why this matters for NeuralPulse

Current ingestion in this repo is RSS/Atom-first (`rss-parser` + `feeds.json`).  
For YouTube podcast channels, the most compatible path is to treat channel uploads as another feed source and only add deeper YouTube-specific integrations where they clearly improve quality.

## What we need from ingestion

- Reliable "new episode" detection from selected YouTube channels.
- Low operational complexity for a local/personal MCP server.
- Reasonable compliance posture (prefer official APIs when possible).
- Optional transcript enrichment for better AI summaries.

## Option 1: YouTube channel Atom feed (fastest path)

Use:

`https://www.youtube.com/feeds/videos.xml?channel_id=<CHANNEL_ID>`

### Pros

- Zero auth and zero quota management.
- Fits existing architecture immediately (already parses Atom/RSS).
- Lowest implementation effort; can be live quickly.

### Cons

- Feed is effectively undocumented/de-emphasized by YouTube, so long-term stability is less guaranteed than official API.
- Metadata is limited versus API responses.
- Transcript/caption data is not included.

### Fit for this repo

Excellent for MVP. Add YouTube channel feed URLs directly into `feeds.json`.

## Option 2: YouTube Data API v3 (official and robust)

Canonical flow:

1. Resolve channel by `id` or `forHandle` via `channels.list` (cost 1).
2. Read `contentDetails.relatedPlaylists.uploads`.
3. Poll `playlistItems.list` on that uploads playlist (cost 1 per request, up to 50 results/page).

### Pros

- Official, documented interface.
- More structured metadata and better control.
- Better long-term maintainability.

### Cons

- Requires Google Cloud project + API key/OAuth setup.
- Quota management is required (default 10,000 units/day).
- More code and configuration than Atom feeds.

### Important quota notes

- `playlistItems.list` cost: 1
- `channels.list` cost: 1
- `search.list` cost: 100 (avoid for polling)

Practical guidance: never use `search.list` in periodic ingestion loops; resolve channel once, then poll uploads playlist.

## Option 3: Transcript enrichment (for better summaries)

### 3A) YouTube Data API captions endpoints

`captions.list` has high cost (50) and requires authorization scopes typically tied to content ownership.  
This is usually not suitable for arbitrary public podcast channels.

### 3B) `yt-dlp` subtitle extraction

Common flags:

- `--skip-download`
- `--write-subs`
- `--write-auto-subs`
- `--list-subs`
- `--sub-langs`

This is practical for personal workflows but should be treated as an optional enrichment layer due to policy/compliance risk and operational fragility.

## Compliance and risk notes

- Preferred baseline: official YouTube API where feasible.
- Avoid brittle HTML scraping of channel pages for core ingestion.
- If using `yt-dlp`, keep it opt-in, transparent, and easy to disable.
- Cache aggressively and avoid excessive polling.

## Recommendation for NeuralPulse

### Phase 1 (now): ship quickly with Atom feeds

- Add YouTube channel feed URLs in `feeds.json`.
- Keep `get_feed` interface unchanged.
- Validate episode freshness and parsing quality.

### Phase 2: add official API adapter behind the same feed contract

- Introduce source kinds in config (`rss`, `youtube_api`, optional `youtube_atom` explicit type).
- Implement a YouTube fetcher module that returns the same normalized `FeedItem`.
- Add simple dedup keying by canonical video URL/video ID.

### Phase 3: optional transcript enrichment

- Add an opt-in enrichment pipeline (likely separate command/tool).
- Prefer captions when available; fallback to best-effort auto captions.
- Store transcript snippets, not full large payloads, in MCP response by default.

## Concrete implementation shape (repo-specific)

1. Extend `FeedSource` in `src/config.ts`:
   - Keep current `name` + `url`.
   - Add optional `type` and YouTube fields (`channelId`, `handle`) for future adapter use.
2. Keep `src/feeds.ts` contract stable:
   - Continue returning normalized `{ title, link, published, source, snippet }`.
3. Add future module `src/youtube.ts` (Phase 2):
   - Resolve uploads playlist once.
   - Poll `playlistItems.list`.
   - Map to `FeedItem`.
4. Preserve MCP tool simplicity:
   - `get_feed` remains source-agnostic.

## Suggested MVP decision

Adopt **Option 1 immediately** (YouTube Atom feeds) for speed and architectural fit, and design code now so **Option 2** can replace/augment specific channels without changing MCP tool semantics.

This gives fast user value while keeping a clean migration path to official API ingestion when reliability or scale requirements increase.

## Sources consulted

- YouTube Data API quota guide: `developers.google.com/youtube/v3/determine_quota_cost`
- `playlistItems.list`: `developers.google.com/youtube/v3/docs/playlistItems/list`
- `channels.list`: `developers.google.com/youtube/v3/docs/channels/list`
- `search.list`: `developers.google.com/youtube/v3/docs/search/list`
- `captions.list`: `developers.google.com/youtube/v3/docs/captions/list`
- `yt-dlp` docs (subtitle options): `github.com/yt-dlp/yt-dlp`
