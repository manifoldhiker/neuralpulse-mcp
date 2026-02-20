import RssParser from "rss-parser";
import {
  ChannelAdapter,
  ConfigFieldDescriptor,
  InfoChannel,
  NormalizedItem,
  SyncCursor,
  SyncResult,
  ValidationResult,
} from "../core/types.js";

const parser = new RssParser({ timeout: 10_000 });

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

export class RssAdapter implements ChannelAdapter {
  readonly type = "rss";
  readonly displayName = "RSS / Atom Feed";
  readonly description = "Subscribe to any RSS or Atom feed by URL.";
  readonly defaultTtlMinutes = 5;
  readonly maxConcurrency = 10;

  describeConfig(): ConfigFieldDescriptor[] {
    return [
      { name: "url", type: "string", required: true, description: "RSS or Atom feed URL" },
      { name: "ttlMinutes", type: "number", required: false, description: "Override default refresh interval (minutes)" },
    ];
  }

  async validate(config: Record<string, unknown>): Promise<ValidationResult> {
    const url = config.url;
    if (typeof url !== "string" || !url) {
      return { ok: false, error: "url is required and must be a string" };
    }
    try {
      const feed = await parser.parseURL(url);
      return { ok: true, displayName: feed.title ?? undefined };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to fetch feed: ${msg}` };
    }
  }

  async sync(channel: InfoChannel, cursor: SyncCursor | null): Promise<SyncResult> {
    const url = channel.config.url as string;
    const feed = await parser.parseURL(url);

    const items: NormalizedItem[] = (feed.items ?? []).map((item) => {
      const externalId = item.guid ?? item.link ?? item.title ?? "";
      return {
        id: `${channel.id}:${externalId}`,
        channelId: channel.id,
        channelType: this.type,
        title: item.title ?? "(untitled)",
        url: item.link ?? "",
        publishedAt: item.isoDate ?? item.pubDate ?? "",
        snippet: truncate(
          stripHtml(item.contentSnippet ?? item.content ?? item.summary ?? ""),
          300,
        ),
        author: item.creator ?? item.author ?? undefined,
      };
    });

    return {
      items,
      nextCursor: { data: {} },
    };
  }
}
