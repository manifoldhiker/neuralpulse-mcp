import {
  ChannelAdapter,
  ConfigFieldDescriptor,
  InfoChannel,
  NormalizedItem,
  SyncCursor,
  SyncResult,
  ValidationResult,
} from "../core/types.js";

type GHEventType = "releases" | "commits" | "pulls" | "issues";
const DEFAULT_EVENTS: GHEventType[] = ["releases", "commits", "pulls", "issues"];

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

interface GitHubResponse {
  status: number;
  data: unknown;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  etag?: string;
}

async function ghFetch(
  path: string,
  token?: string,
  etag?: string,
): Promise<GitHubResponse> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (etag) headers["If-None-Match"] = etag;

  const resp = await fetch(`https://api.github.com${path}`, { headers });

  const remaining = resp.headers.get("x-ratelimit-remaining");
  const reset = resp.headers.get("x-ratelimit-reset");

  if (resp.status === 304) {
    return {
      status: 304,
      data: null,
      rateLimitRemaining: remaining ? Number(remaining) : undefined,
      rateLimitReset: reset ? new Date(Number(reset) * 1000).toISOString() : undefined,
      etag: resp.headers.get("etag") ?? etag,
    };
  }

  if (!resp.ok) {
    throw new Error(`GitHub API ${resp.status}: ${await resp.text()}`);
  }

  return {
    status: resp.status,
    data: await resp.json(),
    rateLimitRemaining: remaining ? Number(remaining) : undefined,
    rateLimitReset: reset ? new Date(Number(reset) * 1000).toISOString() : undefined,
    etag: resp.headers.get("etag") ?? undefined,
  };
}

// ── Normalizers per event type ────────────────────────────────

function normalizeRelease(
  channelId: string,
  repo: string,
  rel: Record<string, unknown>,
): NormalizedItem {
  const tag = rel.tag_name as string;
  const name = (rel.name as string) || tag;
  return {
    id: `${channelId}:release:${repo}:${tag}`,
    channelId,
    channelType: "github_trends",
    title: `Release ${name} in ${repo}`,
    url: rel.html_url as string,
    publishedAt: (rel.published_at ?? rel.created_at) as string,
    snippet: truncate((rel.body as string) ?? "", 300),
    author: (rel.author as Record<string, unknown>)?.login as string,
    meta: { kind: "release", repo, tag },
  };
}

function normalizeCommit(
  channelId: string,
  repo: string,
  c: Record<string, unknown>,
): NormalizedItem {
  const sha = (c.sha as string).slice(0, 7);
  const commit = c.commit as Record<string, unknown>;
  const message = (commit.message as string) ?? "";
  const firstLine = message.split("\n")[0];
  const authorObj = commit.author as Record<string, unknown>;
  return {
    id: `${channelId}:commit:${repo}:${c.sha}`,
    channelId,
    channelType: "github_trends",
    title: `Commit ${sha} in ${repo}: ${firstLine}`,
    url: c.html_url as string,
    publishedAt: (authorObj?.date as string) ?? "",
    snippet: truncate(message, 300),
    author: (c.author as Record<string, unknown>)?.login as string ?? (authorObj?.name as string),
    meta: { kind: "commit", repo, sha: c.sha },
  };
}

function normalizePR(
  channelId: string,
  repo: string,
  pr: Record<string, unknown>,
): NormalizedItem {
  const number = pr.number as number;
  const state = pr.state as string;
  const merged = pr.merged_at ? "merged" : state;
  return {
    id: `${channelId}:pr:${repo}:${number}`,
    channelId,
    channelType: "github_trends",
    title: `PR #${number} ${merged} in ${repo}: ${pr.title}`,
    url: pr.html_url as string,
    publishedAt: (pr.updated_at ?? pr.created_at) as string,
    snippet: truncate((pr.body as string) ?? "", 300),
    author: (pr.user as Record<string, unknown>)?.login as string,
    meta: { kind: "pr", repo, number, state: merged },
  };
}

function normalizeIssue(
  channelId: string,
  repo: string,
  issue: Record<string, unknown>,
): NormalizedItem {
  if (issue.pull_request) return null!;
  const number = issue.number as number;
  return {
    id: `${channelId}:issue:${repo}:${number}`,
    channelId,
    channelType: "github_trends",
    title: `Issue #${number} (${issue.state}) in ${repo}: ${issue.title}`,
    url: issue.html_url as string,
    publishedAt: (issue.updated_at ?? issue.created_at) as string,
    snippet: truncate((issue.body as string) ?? "", 300),
    author: (issue.user as Record<string, unknown>)?.login as string,
    meta: { kind: "issue", repo, number, state: issue.state },
  };
}

// ── Adapter ───────────────────────────────────────────────────

export class GitHubTrendsAdapter implements ChannelAdapter {
  readonly type = "github_trends";
  readonly displayName = "GitHub Repository Tracker";
  readonly description = "Track releases, commits, PRs, and issues from GitHub repositories.";
  readonly defaultTtlMinutes = 10;
  readonly maxConcurrency = 2;

  describeConfig(): ConfigFieldDescriptor[] {
    return [
      { name: "repos", type: "string[]", required: true, description: 'Repositories to track (e.g. ["owner/repo"])' },
      { name: "events", type: "string[]", required: false, description: 'Event types: "releases", "commits", "pulls", "issues" (default: all)' },
      { name: "credentialKey", type: "string", required: false, description: "Env var name holding a GitHub PAT" },
      { name: "ttlMinutes", type: "number", required: false, description: "Override default refresh interval (minutes)" },
    ];
  }

  async validate(config: Record<string, unknown>): Promise<ValidationResult> {
    const repos = config.repos;
    if (!Array.isArray(repos) || repos.length === 0) {
      return { ok: false, error: "repos is required and must be a non-empty array of 'owner/repo' strings" };
    }

    const token = this.resolveToken(config);
    const repo = repos[0] as string;

    try {
      const resp = await ghFetch(`/repos/${repo}`, token);
      const data = resp.data as Record<string, unknown>;
      const name = repos.length === 1
        ? (data.full_name as string)
        : `${repos.length} GitHub repos`;
      return { ok: true, displayName: name };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  async sync(channel: InfoChannel, cursor: SyncCursor | null): Promise<SyncResult> {
    const repos = channel.config.repos as string[];
    const events = (channel.config.events as GHEventType[]) ?? DEFAULT_EVENTS;
    const token = this.resolveToken(channel.config);
    const cursors = (cursor?.data ?? {}) as Record<string, Record<string, string>>;

    const allItems: NormalizedItem[] = [];
    const nextCursors: Record<string, Record<string, string>> = {};
    let minRemaining: number | undefined;
    let resetAt: string | undefined;

    for (const repo of repos) {
      nextCursors[repo] = { ...(cursors[repo] ?? {}) };

      for (const event of events) {
        try {
          const { items, etag, rateLimitRemaining, rateLimitReset } = await this.fetchEvent(
            channel.id,
            repo,
            event,
            token,
            cursors[repo]?.[`${event}_etag`],
            cursors[repo]?.[`${event}_since`],
          );
          allItems.push(...items);
          if (etag) nextCursors[repo][`${event}_etag`] = etag;
          if (items.length > 0) {
            const latest = items.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b));
            nextCursors[repo][`${event}_since`] = latest.publishedAt;
          }
          if (rateLimitRemaining !== undefined) {
            if (minRemaining === undefined || rateLimitRemaining < minRemaining) {
              minRemaining = rateLimitRemaining;
              resetAt = rateLimitReset;
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`GitHub ${event} fetch failed for ${repo}: ${msg}`);
        }
      }
    }

    return {
      items: allItems,
      nextCursor: { data: nextCursors },
      rateLimitRemaining: minRemaining,
      rateLimitResetAt: resetAt,
    };
  }

  private async fetchEvent(
    channelId: string,
    repo: string,
    event: GHEventType,
    token?: string,
    etag?: string,
    _since?: string,
  ): Promise<{
    items: NormalizedItem[];
    etag?: string;
    rateLimitRemaining?: number;
    rateLimitReset?: string;
  }> {
    const pathMap: Record<GHEventType, string> = {
      releases: `/repos/${repo}/releases?per_page=10`,
      commits: `/repos/${repo}/commits?per_page=15`,
      pulls: `/repos/${repo}/pulls?state=all&sort=updated&per_page=10`,
      issues: `/repos/${repo}/issues?state=all&sort=updated&per_page=10`,
    };

    const resp = await ghFetch(pathMap[event], token, etag);

    if (resp.status === 304) {
      return {
        items: [],
        etag: resp.etag,
        rateLimitRemaining: resp.rateLimitRemaining,
        rateLimitReset: resp.rateLimitReset,
      };
    }

    const data = resp.data as Record<string, unknown>[];
    const normalizers: Record<GHEventType, (chId: string, repo: string, d: Record<string, unknown>) => NormalizedItem> = {
      releases: normalizeRelease,
      commits: normalizeCommit,
      pulls: normalizePR,
      issues: normalizeIssue,
    };

    const items = data.map((d) => normalizers[event](channelId, repo, d)).filter(Boolean);

    return {
      items,
      etag: resp.etag,
      rateLimitRemaining: resp.rateLimitRemaining,
      rateLimitReset: resp.rateLimitReset,
    };
  }

  private resolveToken(config: Record<string, unknown>): string | undefined {
    const key = config.credentialKey as string | undefined;
    if (!key) return process.env.GITHUB_TOKEN;
    return process.env[key];
  }
}
