import RssParser from "rss-parser";
import { FeedSource, loadFeeds } from "./config.js";

const parser = new RssParser({
  timeout: 10_000,
});

export interface FeedItem {
  title: string;
  link: string;
  published: string;
  source: string;
  snippet: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}

async function fetchSingleFeed(source: FeedSource): Promise<FeedItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    return (feed.items ?? []).map((item) => ({
      title: item.title ?? "(untitled)",
      link: item.link ?? "",
      published: item.isoDate ?? item.pubDate ?? "",
      source: source.name,
      snippet: truncate(
        stripHtml(item.contentSnippet ?? item.content ?? item.summary ?? ""),
        300
      ),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to fetch ${source.name}: ${message}`);
    return [];
  }
}

export interface GetFeedOptions {
  limit?: number;
  source?: string;
}

export async function getFeed(options: GetFeedOptions = {}): Promise<FeedItem[]> {
  const { limit = 20, source } = options;

  let sources = loadFeeds();

  if (source) {
    const needle = source.toLowerCase();
    sources = sources.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.url.toLowerCase().includes(needle)
    );
    if (sources.length === 0) {
      return [];
    }
  }

  const results = await Promise.allSettled(sources.map(fetchSingleFeed));
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  items.sort((a, b) => {
    const da = a.published ? new Date(a.published).getTime() : 0;
    const db = b.published ? new Date(b.published).getTime() : 0;
    return db - da;
  });

  return items.slice(0, limit);
}
