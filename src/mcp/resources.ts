import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPML_PATH = path.join(__dirname, "..", "..", "docs", "hn-popular-blogs-rss", "hn-popular-blogs-2025.opml");

export interface SuggestedFeed {
  name: string;
  feedUrl: string;
  siteUrl: string;
}

function parseOpml(xml: string): SuggestedFeed[] {
  const feeds: SuggestedFeed[] = [];
  const re = /<outline[^>]+type="rss"[^>]*\/?\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const tag = match[0];
    const title = tag.match(/title="([^"]*)"/)?.[1] ?? "";
    const xmlUrl = tag.match(/xmlUrl="([^"]*)"/)?.[1] ?? "";
    const htmlUrl = tag.match(/htmlUrl="([^"]*)"/)?.[1] ?? "";
    if (xmlUrl) {
      feeds.push({ name: title || htmlUrl, feedUrl: xmlUrl, siteUrl: htmlUrl });
    }
  }
  return feeds;
}

let cachedFeeds: SuggestedFeed[] | null = null;

function getSuggestedFeeds(): SuggestedFeed[] {
  if (!cachedFeeds) {
    const xml = readFileSync(OPML_PATH, "utf-8");
    cachedFeeds = parseOpml(xml);
  }
  return cachedFeeds;
}

function renderSuggestedFeeds(feeds: SuggestedFeed[]): string {
  const header =
    "# Suggested RSS Feeds — HN Popular Blogs 2025\n" +
    "Popular blogs frequently shared on Hacker News.\n" +
    "Use create_channel with type \"rss\" and config { \"url\": \"<feedUrl>\" } to subscribe.\n\n";

  const rows = feeds.map(
    (f, i) =>
      `${i + 1}. **${f.name}**\n` +
      `   Feed: ${f.feedUrl}\n` +
      `   Site: ${f.siteUrl}`,
  );

  return header + rows.join("\n\n");
}

const RESOURCE_URI = "neuralpulse://suggested-feeds/hn-popular-blogs";

export function registerResources(server: McpServer): void {
  server.resource(
    "suggested-feeds-hn-popular-blogs",
    RESOURCE_URI,
    {
      description:
        "A curated list of ~100 popular tech blogs from the 2025 HN Popularity Contest. " +
        "Browse this to pick RSS feeds to subscribe to with create_channel.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: renderSuggestedFeeds(getSuggestedFeeds()),
          mimeType: "text/markdown",
        },
      ],
    }),
  );
}
