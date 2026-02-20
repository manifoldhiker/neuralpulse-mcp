import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { AdapterRegistry } from "./core/adapter-registry.js";
import { FeedService } from "./core/feed-service.js";
import { SyncCoordinator } from "./core/sync-coordinator.js";
import { JsonChannelStore } from "./stores/channel-store.js";
import { InMemoryItemStore } from "./stores/item-store.js";
import { JsonSyncStateStore } from "./stores/sync-state-store.js";
import { RssAdapter } from "./adapters/rss.js";
import { YouTubePodcastAdapter } from "./adapters/youtube-podcast.js";
import { GitHubTrendsAdapter } from "./adapters/github-trends.js";
import { registerTools } from "./mcp/tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

// ── Adapter registry ────────────────────────────────────────────

const adapters = new AdapterRegistry();
adapters.register(new RssAdapter());
adapters.register(new YouTubePodcastAdapter());
adapters.register(new GitHubTrendsAdapter());

// ── Stores ──────────────────────────────────────────────────────

const channelStore = new JsonChannelStore(resolve(DATA_DIR, "channels.json"));
const itemStore = new InMemoryItemStore();
const syncStateStore = new JsonSyncStateStore(resolve(DATA_DIR, "sync-state.json"));

// ── Core services ───────────────────────────────────────────────

const syncCoordinator = new SyncCoordinator(adapters, itemStore, syncStateStore, channelStore);
const feedService = new FeedService(channelStore, itemStore, syncCoordinator, adapters);

// ── MCP server ──────────────────────────────────────────────────

const server = new McpServer({
  name: "neuralpulse",
  version: "2.0.0",
});

registerTools(server, feedService, syncStateStore);

// ── Start ───────────────────────────────────────────────────────

async function main() {
  syncCoordinator.startBackgroundSync();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
