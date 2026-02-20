# Substack Ingestion Research

Date: 2026-02-20

## Why this matters for NeuralPulse

Substack has become a primary home for high-quality longform writing: independent journalism, technical deep-dives, industry analysis, and creator newsletters. Many of the blogs in the HN-popular RSS list are actually Substack publications. Adding first-class Substack support means better coverage of the content that NeuralPulse users care about most.

Current ingestion is adapter-based: each source type implements `ChannelAdapter` (with `describeConfig`, `validate`, `sync`), normalizes to `NormalizedItem`, and feeds into the unified pipeline. The existing `RssAdapter` already uses `rss-parser` and handles Atom/RSS. Substack integration needs to account for what RSS gives us for free, where it falls short, and whether deeper integration is worth the complexity.

## What we need from ingestion

- Reliable "new post" detection from selected Substack publications.
- Low operational complexity (no external services, no paid API keys for MVP).
- Reasonable content quality: enough text for AI summarization, not just titles.
- Support for both `*.substack.com` and custom-domain publications.

## Substack's data access landscape

### 1) RSS feed (every publication has one)

Every Substack publication exposes an RSS 2.0 feed at:

- `https://{publication}.substack.com/feed`
- `https://{custom-domain}/feed` (same endpoint on custom domains)

Feed includes: title, link, pubDate, `content:encoded` (HTML body), author, guid.

### 2) Official Substack Developer API

Substack launched an official API (ToS updated January 2026). It is very limited:

- Searches for public creator profiles by LinkedIn handle.
- Returns metadata: subscriber counts, leaderboard status, profile info.
- No post content endpoints.
- Requires form submission and 3-5 business day approval.
- Not useful for content ingestion.

### 3) Unofficial community API (substackapi.dev)

An open-source third-party API by Noah Bjorner:

- Endpoints: `/posts/latest`, `/posts/top`, `/posts/search`, `/post` (by slug).
- Requires API key (`X-API-Key` header); free tier available.
- Rate limits: 10-20 req/min depending on endpoint.
- Hybrid architecture: combines undocumented Substack API + RSS fallback + Redis cache.
- Data may be delayed by a few hours due to caching.

### 4) Undocumented Substack internal API

Substack's frontend makes JSON API calls that can be replicated:

- `https://{publication}.substack.com/api/v1/posts?limit=N&offset=M` for archive listing.
- `https://{publication}.substack.com/api/v1/posts/{slug}` for single post with full body.
- `https://substack.com/api/v1/publication/search?query=...` for search across publications.

These are undocumented, unsigned, and could change without notice. No auth required for public posts.

### 5) Scraping tools (Apify, substack_archiver, etc.)

Third-party scrapers that use combinations of the above endpoints. Not suitable for direct integration; mentioned for completeness.

## Detailed option analysis

### Option 1: RSS feed via existing RssAdapter (fastest path)

Users add `https://{publication}.substack.com/feed` directly as an `rss` channel.

#### Pros

- Already works today. Zero new code needed.
- `rss-parser` handles Substack's RSS 2.0 with `content:encoded` correctly.
- Covers both `*.substack.com` and custom-domain publications identically.
- No auth, no API keys, no rate limits (standard HTTP caching applies).
- `content:encoded` provides the full HTML body for free posts, more than enough for snippet extraction and AI summarization.

#### Cons

- Paid/paywalled posts are truncated to the free preview portion only.
- Feed typically returns the most recent ~20 posts. No deep archive access.
- No structured metadata beyond what RSS provides (no subscriber count, no tags, no like count).
- No way to discover new publications programmatically; user must know the URL.

#### Paid content workaround

If the user has a paid subscription, they can obtain their `substack.sid` cookie and pass it as a request header. The feed endpoint returns full content when authenticated. This is fragile (cookie expires in ~3 months) and should only be offered as an opt-in power-user feature.

#### Content quality test

Substack RSS feeds include `content:encoded` with the full HTML body of free posts. The existing `RssAdapter.sync()` strips HTML and truncates to 300 chars for the snippet. This is adequate for summarization-quality output. If richer summaries are wanted, the full `content:encoded` HTML can be preserved in `meta`.

### Option 2: Dedicated Substack adapter using internal JSON API

Build a `SubstackAdapter` that hits the undocumented JSON endpoints directly.

#### Pros

- Access to richer metadata: subtitle, post type (newsletter/podcast/thread), like count, comment count, word count.
- Archive pagination: can go deeper than the ~20 most recent posts.
- Structured JSON response (no XML parsing).
- Could support "discover similar publications" features later.

#### Cons

- Undocumented API: no stability guarantees, could break at any time.
- Compliance risk: scraping-adjacent behavior, even for public data.
- More code to build and maintain vs. zero-effort RSS path.
- No meaningful advantage for the core use case of "notify me about new posts."

### Option 3: Community API (substackapi.dev)

Use the third-party wrapper API.

#### Pros

- Clean REST interface with documentation.
- Handles the undocumented API complexity for us.
- Free tier sufficient for personal use.

#### Cons

- External dependency on a community project with no SLA.
- Rate limits (10-20 req/min) add operational constraints.
- API key management overhead.
- Data freshness lag (cached, hours behind).
- For a personal MCP server, this is an unnecessary middleman when RSS gives us direct access.

## RSS parsing compatibility notes

Substack feeds are RSS 2.0 with the `content:encoded` extension (from the `http://purl.org/rss/1.0/modules/content/` namespace). The `rss-parser` library used in this repo handles this correctly:

- `item.content` maps to `content:encoded` (full HTML body).
- `item.contentSnippet` provides a plaintext version.
- `item.guid` is the canonical post URL.
- `item.isoDate` is parsed correctly.
- `item.creator` captures the author name.

No code changes are needed in `RssAdapter` to handle Substack feeds.

## Handling custom domains

Many popular Substack publications use custom domains (e.g., `newsletter.pragmaticengineer.com`, `stratechery.com`). The `/feed` endpoint works identically on custom domains. From an ingestion perspective, there is no difference: a custom-domain Substack feed is just another RSS URL.

For UX, the system could detect Substack publications (via response headers or feed metadata) and surface that fact, but this is cosmetic and not required.

## OPML import for bulk onboarding

Users who already subscribe to Substacks can export their subscription list:

- **SOPML** (`github.com/skogard/SOPML`): one-click browser tool that exports Substack subscriptions to OPML.
- **Bookmarklet** (`gist.github.com/lmorchard/f1f2508a9586d8e92efd84686c029f16`): runs on `substack.com/library`, generates OPML.

NeuralPulse could accept OPML imports to create channels in bulk. This is not Substack-specific (OPML is standard) and would benefit all RSS-based sources.

## Recommendation for NeuralPulse

### Phase 1 (now): use RSS, it already works

- Substack publications should be added as standard `rss` channels.
- Feed URL: `https://{publication}.substack.com/feed` or `https://{custom-domain}/feed`.
- No new adapter, no new code. The existing `RssAdapter` handles Substack feeds correctly.
- Document this for users as a first-class supported pattern.

### Phase 2: Substack-aware UX enhancements

- Add a convenience helper that accepts a Substack publication name or URL and auto-generates the feed URL (e.g., input `pragmaticengineer` produces `https://newsletter.pragmaticengineer.com/feed`).
- Support OPML import for bulk channel creation from Substack subscription exports.
- Optionally detect Substack feeds and surface publication metadata (author bio, subscriber count via profile page scrape).

### Phase 3: dedicated adapter (only if RSS proves insufficient)

Build a `SubstackAdapter` only if concrete limitations emerge:

- Users need deep archive access (more than ~20 recent posts).
- Users need structured metadata (like counts, comment counts, post categories).
- Users need podcast/audio post support (Substack podcasts have separate audio URLs not always in RSS).

The adapter would use Substack's undocumented JSON API (`/api/v1/posts`) behind the same `ChannelAdapter` interface, mapping to `NormalizedItem` identically.

### Not recommended

- The official Substack Developer API: too limited (no post content, only profile metadata).
- The community API (substackapi.dev): unnecessary indirection when RSS provides direct access with better freshness.
- Authenticated ingestion for paid content: fragile cookie-based auth; only offer as opt-in escape hatch.

## Concrete implementation shape (Phase 1, already possible)

No code changes needed. Users add a channel:

```json
{
  "type": "rss",
  "name": "Stratechery",
  "config": { "url": "https://stratechery.com/feed" },
  "tags": ["tech", "strategy"]
}
```

The existing pipeline handles everything: fetch, parse, normalize, store, surface via MCP tools.

## Concrete implementation shape (Phase 3, if needed later)

New file: `src/adapters/substack.ts`

- `type: "substack"`
- Config fields: `publication` (slug or custom domain), optional `includePaidPreviews` boolean.
- `validate()`: fetch `https://{publication}.substack.com/api/v1/posts?limit=1` and confirm 200.
- `sync()`: paginate `/api/v1/posts`, map to `NormalizedItem`.
- `NormalizedItem.meta`: store Substack-specific fields (`subtitle`, `type`, `likes`, `comments`, `wordCount`).
- Register in `AdapterRegistry` alongside `rss`, `github-trends`, `youtube-podcast`.

## Sources consulted

- Substack RSS feed documentation: https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication
- Substack API Terms of Service (Jan 2026): https://substack.com/api-tos
- Substack Developer API support article: https://support.substack.com/hc/en-us/articles/45099095296916-Substack-Developer-API
- Community Substack API (substackapi.dev): https://substackapi.dev/introduction
- substackapi.dev rate limits: https://substackapi.dev/usage-limits
- substackapi.dev technical overview: https://substackapi.dev/technical-overview
- RSS-Bridge Substack bridge (paid content via cookie auth): https://rss-bridge.github.io/rss-bridge/Bridge_Specific/Substack.html
- SOPML (Substack OPML export): https://github.com/skogard/SOPML
- Substack OPML bookmarklet: https://gist.github.com/lmorchard/f1f2508a9586d8e92efd84686c029f16
- Undocumented API reverse engineering: https://medium.com/@hungcheungchan/scraping-substack-metadata-using-undocumented-unofficial-api-aee82786b507
- substack_archiver: https://github.com/pwrtux/substack_archiver
