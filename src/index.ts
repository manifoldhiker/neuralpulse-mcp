import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

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

const DATA_DIR = resolve(
  process.env.NEURALPULSE_DATA_DIR ?? join(homedir(), ".neuralpulse"),
  "data",
);

const LOCAL_USER_ID = "local";

// ── Adapter registry ────────────────────────────────────────────

const adapters = new AdapterRegistry();
adapters.register(new RssAdapter());
adapters.register(new YouTubePodcastAdapter());
adapters.register(new GitHubTrendsAdapter());

// ── Stores (legacy file-based for local stdio mode) ─────────────

const channelStore = new JsonChannelStore(resolve(DATA_DIR, "channels.json"));
const itemStore = new InMemoryItemStore();
const syncStateStore = new JsonSyncStateStore(resolve(DATA_DIR, "sync-state.json"));

// ── Core services ───────────────────────────────────────────────

const syncCoordinator = new SyncCoordinator(adapters, itemStore, syncStateStore, channelStore, LOCAL_USER_ID);
const feedService = new FeedService(channelStore, itemStore, syncCoordinator, adapters);

// ── MCP server ──────────────────────────────────────────────────

const server = new McpServer({
  name: "neuralpulse",
  version: "2.0.0",
});

registerTools(server, feedService, syncStateStore, () => LOCAL_USER_ID);

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
