import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface FeedSource {
  name: string;
  url: string;
}

interface FeedsConfig {
  feeds: FeedSource[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDS_PATH = resolve(__dirname, "..", "feeds.json");

export function loadFeeds(): FeedSource[] {
  const raw = readFileSync(FEEDS_PATH, "utf-8");
  const config: FeedsConfig = JSON.parse(raw);
  return config.feeds;
}
