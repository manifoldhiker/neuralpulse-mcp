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

const parser = new RssParser({ timeout: 15_000 });

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

function atomFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function extractVideoId(link: string): string {
  try {
    const url = new URL(link);
    return url.searchParams.get("v") ?? link;
  } catch {
    return link;
  }
}

export class YouTubePodcastAdapter implements ChannelAdapter {
  readonly type = "youtube_podcast";
  readonly displayName = "YouTube Podcast / Channel";
  readonly description = "Subscribe to a YouTube channel's uploads via its Atom feed. Great for podcasts published on YouTube.";
  readonly defaultTtlMinutes = 15;
  readonly maxConcurrency = 5;

  describeConfig(): ConfigFieldDescriptor[] {
    return [
      { name: "channelId", type: "string", required: true, description: "YouTube channel ID (starts with UC...)" },
      { name: "handle", type: "string", required: false, description: "YouTube @handle for display" },
      { name: "ttlMinutes", type: "number", required: false, description: "Override default refresh interval (minutes)" },
    ];
  }

  async validate(config: Record<string, unknown>): Promise<ValidationResult> {
    const channelId = config.channelId;
    if (typeof channelId !== "string" || !channelId) {
      return { ok: false, error: "channelId is required and must be a string" };
    }

    try {
      const feed = await parser.parseURL(atomFeedUrl(channelId));
      return { ok: true, displayName: feed.title ?? undefined };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to fetch YouTube feed: ${msg}` };
    }
  }

  async sync(channel: InfoChannel, cursor: SyncCursor | null): Promise<SyncResult> {
    const channelId = channel.config.channelId as string;
    const feed = await parser.parseURL(atomFeedUrl(channelId));

    const lastPublished = cursor?.data.lastPublishedAt as string | undefined;
    const lastPublishedMs = lastPublished ? new Date(lastPublished).getTime() : 0;

    let latestPublished = lastPublished ?? "";

    const items: NormalizedItem[] = [];

    for (const entry of feed.items ?? []) {
      const pubDate = entry.isoDate ?? entry.pubDate ?? "";
      const pubMs = pubDate ? new Date(pubDate).getTime() : 0;

      if (lastPublishedMs > 0 && pubMs <= lastPublishedMs) continue;

      if (pubDate > latestPublished) latestPublished = pubDate;

      const link = entry.link ?? "";
      const vid = extractVideoId(link);

      items.push({
        id: `${channel.id}:${vid}`,
        channelId: channel.id,
        channelType: this.type,
        title: entry.title ?? "(untitled)",
        url: link || videoUrl(vid),
        publishedAt: pubDate,
        snippet: truncate(entry.contentSnippet ?? entry.content ?? entry.summary ?? "", 300),
        author: entry.author ?? (feed.title || undefined),
        meta: { videoId: vid },
      });
    }

    return {
      items,
      nextCursor: { data: { lastPublishedAt: latestPublished } },
    };
  }
}
