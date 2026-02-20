# Programmatic Access to GitHub Ecosystem-Wide Trend Data: Technical Report

## Executive Summary

There is no single "GitHub Trends API" endpoint. Instead, ecosystem-wide trend data must be assembled from **five complementary data sources**, each with different granularity, latency, and access patterns. This report maps every available option, from official GitHub APIs to bulk event archives and third-party analytics services, with concrete endpoints, rate limits, and code examples.

***

## 1. Official GitHub APIs

### 1.1 REST API — Search Endpoints

The REST API Search endpoints are the most direct way to query repository-level trends programmatically.[1][2]

**Base URL:** `https://api.github.com/search/repositories`

**Key qualifiers:**

| Qualifier | Example | Purpose |
|---|---|---|
| `stars:>N` | `stars:>1000` | Filter by star count |
| `forks:>N` | `forks:>500` | Filter by fork count |
| `language:X` | `language:python` | Filter by language |
| `created:>DATE` | `created:>2025-01-01` | Repos created after date |
| `pushed:>DATE` | `pushed:>2025-12-01` | Recently active repos |
| `topic:X` | `topic:machine-learning` | Filter by topic |
| `sort` | `stars`, `forks`, `help-wanted-issues`, `updated` | Sort order |

**Example — top starred Python repos:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/search/repositories?q=language:python+stars:>5000&sort=stars&order=desc&per_page=100"
```

**Limitations:**
- Returns max 1,000 results per query (10 pages × 100 per page)[3]
- Search API rate limit: **30 requests/minute** (authenticated), **10/minute** (unauthenticated)[4]
- Snapshot-in-time data only — no historical trend curves

### 1.2 REST API — Traffic Endpoints

For repositories you own or have admin access to, the Traffic API provides granular engagement data:[5][6]

| Endpoint | Data | Retention |
|---|---|---|
| `GET /repos/{owner}/{repo}/traffic/views` | Page views (total + unique) by day/week | 14 days |
| `GET /repos/{owner}/{repo}/traffic/clones` | Clone counts (total + unique) by day/week | 14 days |
| `GET /repos/{owner}/{repo}/traffic/popular/paths` | Top 10 visited paths | 14 days |
| `GET /repos/{owner}/{repo}/traffic/popular/referrers` | Top 10 referral sources | 14 days |

**Key constraint:** Only available to users with push access to the repository, and data retention is limited to 14 days. To build historical trend data, you must poll and store this data regularly.[7]

### 1.3 REST API — Activity & Events

The Events API exposes a real-time stream of public activity:[8]

```bash
# Public events (all GitHub)
GET /events

# Events for a specific repo
GET /repos/{owner}/{repo}/events

# Events for an organization
GET /orgs/{org}/events
```

GitHub provides **15+ event types** including `WatchEvent` (stars), `ForkEvent`, `PushEvent`, `IssuesEvent`, `PullRequestEvent`, `CreateEvent`, `DeleteEvent`, `ReleaseEvent`, and more. The Events API only retains approximately the **last 90 days** of events and paginates to a max of 300 events per endpoint.[9][10]

### 1.4 REST API — Starring (Star History)

You can reconstruct star history by paginating through stargazers with timestamps:[11]

```bash
curl -H "Accept: application/vnd.github.v3.star+json" \
     -H "Authorization: Bearer $TOKEN" \
     "https://api.github.com/repos/OWNER/REPO/stargazers?per_page=100&page=1"
```

This returns `starred_at` timestamps per stargazer. For repos with >40k stars, you hit the API pagination ceiling (~400 pages × 100).[11]

### 1.5 GraphQL API — Flexible Metrics Queries

The GraphQL API allows batching multiple metrics in a single request and is more efficient for bulk data collection.[12]

**Rate limits:**
- **5,000 points/hour** per user or app
- **10,000 points/hour** per org-owned GitHub App
- Max **2,000 points/minute** (secondary limit)[12]

**Example query — repo metrics:**
```graphql
query {
  search(query: "language:typescript sort:stars-desc", type: REPOSITORY, first: 50) {
    repositoryCount
    nodes {
      ... on Repository {
        name
        url
        stargazerCount
        forkCount
        issues { totalCount }
        pullRequests { totalCount }
        watchers { totalCount }
        releases { totalCount }
        primaryLanguage { name }
        createdAt
        updatedAt
      }
    }
  }
}
```

### 1.6 GraphQL API — OSPO Metrics (Beta)

GitHub added new metrics under the `Repository` object in public beta:[13]

| Metric | Description |
|---|---|
| `lastContributionDate` | Most recent commit, issue, discussion, PR, or review on the default branch |
| `commitCount` | Monotonically increasing total commits on the default branch |

**Required header:**
```
GraphQL-Features: ospo_metrics_api
```

These are designed for identifying unmaintained projects and tracking overall activity velocity. The GitHub OSPO also provides open-source GitHub Actions for automated metrics collection, including `github/issue-metrics` (time-to-first-response, open/close counts), `github/stale-repos` (inactivity detection), and `github/contributors` (contributor analysis over time).[14][13]

***

## 2. GH Archive — Bulk Event Data

### 2.1 Overview

GH Archive records the **entire public GitHub timeline** as hourly JSON archives dating back to 2011. This is the primary data source for ecosystem-wide historical analysis.[15]

**Direct download:**
```bash
# Single hour
wget https://data.gharchive.org/2025-01-01-15.json.gz

# Full day
wget https://data.gharchive.org/2025-01-01-{0..23}.json.gz

# Full month
wget https://data.gharchive.org/2025-01-{01..31}-{0..23}.json.gz
```

Each archive contains JSON-encoded events as reported by the GitHub API. A single hourly file can exceed **100MB compressed** (~750MB uncompressed) containing 200,000+ events.[16]

### 2.2 Google BigQuery Public Dataset

The entire GH Archive is mirrored as a public BigQuery dataset, updated hourly:[17][15]

- **Project:** `githubarchive`
- **Tables:** `githubarchive:day.YYYYMMDD`, `githubarchive:month.YYYYMM`, `githubarchive:year.YYYY`
- **Free tier:** 1 TB of data processed per month[15]

**Example — trending repos by stars this month:**
```sql
SELECT repo.name, COUNT(*) as stars
FROM `githubarchive.month.202601`
WHERE type = 'WatchEvent'
GROUP BY repo.name
ORDER BY stars DESC
LIMIT 50
```

**Example — language trends over time:**
```sql
SELECT
  JSON_EXTRACT_SCALAR(payload, '$.pull_request.head.repo.language') AS language,
  COUNT(*) AS prs
FROM `githubarchive.month.202601`
WHERE type = 'PullRequestEvent'
  AND JSON_EXTRACT_SCALAR(payload, '$.action') = 'opened'
GROUP BY language
ORDER BY prs DESC
LIMIT 20
```

BigQuery only charges for data scanned in queried columns, making targeted queries very cost-effective.[17]

### 2.3 ClickHouse Public Playground

ClickHouse hosts a public dataset of GitHub events at `sql.clickhouse.com` in the `github.events` table:[18]

```sql
SELECT toDate(created_at) AS day, event_type, count() as events
FROM github.events
WHERE event_type IN ('IssuesEvent', 'ForkEvent', 'PullRequestEvent', 'WatchEvent')
AND repo_name = 'deepseek-ai/DeepSeek-R1'
GROUP BY ALL
ORDER BY day
```

This is free to query and provides an alternative to BigQuery for ad-hoc analysis.[18]

***

## 3. GitHub Innovation Graph — Pre-Aggregated Macro Data

GitHub publishes the **Innovation Graph**, a structured dataset of public activity aggregated by country/economy on a quarterly basis from 2020 onward.[19]

**Data dimensions:**

| Metric | Granularity |
|---|---|
| Git Pushes | By economy, quarterly |
| Developers | By economy, quarterly |
| Organizations | By economy, quarterly |
| Repositories | By economy, quarterly |
| Languages | By economy + language, quarterly |
| Licenses | By economy + license, quarterly |
| Topics | By economy + topic, quarterly |
| Economy Collaborators | Cross-border collaboration, quarterly |

**Access:** Data is available as CSV files in the `github/innovationgraph` repository (CC0-1.0 licensed), currently at version v1.0.9 (January 2026). Economies with fewer than 100 unique developers in a given quarter are excluded for privacy.[20][19]

**Limitations:** Only public activity, only economy-level geographic granularity, only quarterly temporal resolution.[19]

***

## 4. Third-Party APIs and Tools

### 4.1 OSSInsight API

OSSInsight (by PingCAP/TiDB) provides a purpose-built analytics API on top of 8+ billion rows of GitHub event data.[21][22]

**Base URL:** `https://api.ossinsight.io/v1`

**Available endpoints:**

| Category | Example Endpoint |
|---|---|
| Trends | `/trends` |
| Collections | Collection-based rankings |
| Stargazers | `/repos/{owner}/{repo}/stargazers/countries` |
| Issue Creators | Geographic + temporal breakdown |
| PR Creators | Geographic + temporal breakdown |

**Rate limits:** 600 requests/hour per IP, 1,000 requests/minute globally. No authentication required for the beta API.[21]

**Example:**
```bash
curl https://api.ossinsight.io/v1/repos/pingcap/tidb/stargazers/countries
```

OSSInsight also offers a **GPT-powered Data Explorer** that generates SQL from natural language queries against the GitHub events dataset.[22]

### 4.2 Third-Party Scraper APIs

Services like AllThingsDev offer GitHub Trending scraper APIs that extract data from GitHub's trending page (which has no official API):[23]

```javascript
const response = await axios.post(
  'https://www.allthingsdev.co/api/rapidapi/github/trending',
  { headers: { 'Authorization': `Bearer ${apiKey}` } }
);
```

These support filtering by language and time period (daily, weekly, monthly). Note these are unofficial and scrape-based.[23]

### 4.3 Trendgetter (Open Source)

Trendgetter is a free open-source API providing trending data from GitHub (and other platforms like Google, YouTube, Reddit). Self-hostable for custom deployments.[24]

***

## 5. Rate Limits Summary

| Source | Rate Limit | Auth Required |
|---|---|---|
| GitHub REST API (general) | 5,000 req/hr (authenticated), 60/hr (unauth) | Yes (for useful limits) |
| GitHub REST API (search) | 30 req/min (auth), 10/min (unauth) | Yes |
| GitHub GraphQL API | 5,000 points/hr, 2,000 points/min | Yes |
| GH Archive (direct download) | Unlimited (HTTP) | No |
| BigQuery | 1 TB free/month, then pay-per-scan | Google Cloud account |
| ClickHouse Playground | Free (public instance) | No |
| OSSInsight API | 600 req/hr per IP | No |

Sources:[4][12][15][21]

***

## 6. Architecture Recommendation

For building a comprehensive GitHub ecosystem trend tracker, a layered approach works best:

### Layer 1: Real-Time Signals
- **GitHub Events API** for live event streaming (poll every 60s)
- **Webhooks** for repos/orgs you control (push-based, no polling needed)

### Layer 2: Daily/Weekly Aggregation
- **GH Archive via BigQuery** for daily ecosystem-wide queries (star velocity, PR counts, language adoption)
- **GitHub Search API** for daily snapshots of top repos by stars/forks in target categories
- **Traffic API** (for owned repos) polled daily and stored locally to overcome 14-day retention[7]

### Layer 3: Historical Analysis
- **GH Archive full dataset** (BigQuery or ClickHouse) for multi-year trend analysis
- **GitHub Innovation Graph** CSVs for macro-level country/language/license trends[19]
- **OSSInsight API** for pre-computed cross-repo analytics[21]

### Layer 4: Enrichment
- **GraphQL API** for detailed repo/contributor metadata with OSPO metrics[13]
- **Star history reconstruction** via stargazer pagination for growth curves[11]

### Suggested Tech Stack
```
┌─────────────────────────────────────────┐
│           Scheduler (cron / Temporal)    │
├─────────────────────────────────────────┤
│  GitHub REST/GraphQL  │  GH Archive     │
│  (real-time signals)  │  (BigQuery SQL) │
├─────────────────────────────────────────┤
│         PostgreSQL / ClickHouse         │
│         (local time-series store)       │
├─────────────────────────────────────────┤
│  OSSInsight API  │  Innovation Graph    │
│  (enrichment)    │  (macro CSV import)  │
├─────────────────────────────────────────┤
│         API / Dashboard Layer           │
└─────────────────────────────────────────┘
```

### Token Management
To stay within rate limits at scale, rotate multiple Personal Access Tokens (PATs) or use a GitHub App (which gets 15,000 req/hr on GHEC). Prefer GraphQL over REST for batching — a single GraphQL query can retrieve data that would require dozens of REST calls. Use conditional requests (`If-None-Match` / ETags) and implement exponential backoff with jitter on 429 responses.[12]

***

## 7. What Is NOT Possible

- **No official GitHub Trending API** — GitHub's trending page (`github.com/trending`) has no public API. All trending data access is either scraped or reconstructed from event data.
- **No private repository data** — All ecosystem-wide sources (GH Archive, Innovation Graph, Events API) only cover public repositories.[20]
- **No individual user analytics at scale** — Rate limits prevent bulk profiling of users; contributor-level data must be aggregated from event streams.
- **Star history ceiling** — The stargazer pagination API caps at ~40k entries due to pagination limits.[11]
- **Traffic data portability** — Traffic API data is only available to repo admins and has a 14-day rolling window with no historical backfill.[6]


Yes, the `/trends` endpoint is fully public. Here's what you need to know:

**Endpoint:** `GET https://api.ossinsight.io/v1/trends/repos` [ossinsight](https://ossinsight.io/docs/api/list-trending-repos/)

**No authentication required** — the beta API is completely open, with only rate limits applied (600 req/hr per IP, 1,000 req/min global). [ossinsight](https://ossinsight.io/docs/api/)

### Query Parameters

| Parameter | Values | Default |
|---|---|---|
| `period` | `past_24_hours`, `past_week`, `past_month`, `past_3_months` | `past_24_hours` |
| `language` | `All`, `JavaScript`, `Python`, `TypeScript`, `Rust`, `Go`, `C++`, `Java`, etc. | `All` |

 [ossinsight](https://ossinsight.io/docs/api/list-trending-repos/)

### Response Fields

Each returned repo includes: `repo_id`, `repo_name`, `primary_language`, `description`, `stars`, `forks`, `pull_requests`, `pushes`, `total_score`, `contributor_logins`, and `collection_names`. [ossinsight](https://ossinsight.io/docs/api/list-trending-repos/)

### Quick Test

```bash
curl "https://api.ossinsight.io/v1/trends/repos?period=past_week&language=Python"
```

It runs on 8+ billion rows of GitHub event data in TiDB Cloud and computes a `total_score` that blends stars, forks, PRs, and pushes — essentially an open-source alternative to the now-removed GitHub Trending page. Note the `language` param needs to be URI-encoded for languages like `C++` → `C%2B%2B`. [github](https://github.com/pingcap/ossinsight)
