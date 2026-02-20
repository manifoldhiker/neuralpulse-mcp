import { AdapterRegistry } from "./core/adapter-registry.js";
import { FeedService } from "./core/feed-service.js";
import { SyncCoordinator } from "./core/sync-coordinator.js";
import { JsonChannelStore } from "./stores/channel-store.js";
import { InMemoryItemStore } from "./stores/item-store.js";
import { JsonSyncStateStore } from "./stores/sync-state-store.js";
import { RssAdapter } from "./adapters/rss.js";
import { YouTubePodcastAdapter } from "./adapters/youtube-podcast.js";
import { GitHubTrendsAdapter } from "./adapters/github-trends.js";
import { renderFeedItems, renderChannelTypes, renderChannelList } from "./mcp/render.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data", "test");

rmSync(DATA_DIR, { recursive: true, force: true });

const adapters = new AdapterRegistry();
adapters.register(new RssAdapter());
adapters.register(new YouTubePodcastAdapter());
adapters.register(new GitHubTrendsAdapter());

const channelStore = new JsonChannelStore(resolve(DATA_DIR, "channels.json"));
const itemStore = new InMemoryItemStore();
const syncStateStore = new JsonSyncStateStore(resolve(DATA_DIR, "sync-state.json"));
const syncCoordinator = new SyncCoordinator(adapters, itemStore, syncStateStore, channelStore, {
  backgroundIntervalMs: 60_000,
});
const feedService = new FeedService(channelStore, itemStore, syncCoordinator, adapters);

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function run() {
  console.log("=== 1. get_channel_types ===");
  const types = feedService.getChannelTypes();
  assert(types.length >= 1, "expected at least 1 channel type");
  assert(types.some((t) => t.type === "rss"), "expected rss type");
  console.log(renderChannelTypes(types));

  console.log("\n=== 2. create_channel (RSS) ===");
  const { channel, syncResult } = await feedService.createChannel({
    type: "rss",
    name: "Simon Willison",
    config: { url: "https://simonwillison.net/atom/everything/" },
    tags: ["tech", "ai"],
  });
  assert(syncResult.itemCount > 0, "expected items from initial sync");
  console.log(`Created: ${channel.name} (${channel.id}) — ${syncResult.itemCount} items`);

  console.log("\n=== 3. list_channels ===");
  const channels = feedService.listChannels();
  assert(channels.length === 1, "expected 1 channel");
  const states = new Map(syncStateStore.all().map((s) => [s.channelId, s]));
  console.log(renderChannelList(channels, states));

  console.log("\n=== 4. get_feed (limit=3) ===");
  const items = await feedService.getFeed({ limit: 3 });
  assert(items.length === 3, "expected 3 items");
  console.log(renderFeedItems(items));

  console.log("\n=== 5. get_feed by channel_type ===");
  const byType = await feedService.getFeed({ limit: 2, channelTypes: ["rss"] });
  assert(byType.length === 2, "expected 2 items");
  console.log(`Got ${byType.length} RSS items`);

  console.log("\n=== 6. get_feed by tag ===");
  const byTag = await feedService.getFeed({ limit: 2, tags: ["ai"] });
  assert(byTag.length === 2, "expected 2 items with 'ai' tag");
  console.log(`Got ${byTag.length} items tagged 'ai'`);

  console.log("\n=== 7. update_channel ===");
  const updated = await feedService.updateChannel(channel.id, { tags: ["tech", "ai", "blog"] });
  assert(updated.tags.length === 3, "expected 3 tags");
  console.log(`Updated tags: ${updated.tags.join(", ")}`);

  console.log("\n=== 8. sync_channel ===");
  const syncRes = await feedService.syncChannel(channel.id);
  assert(syncRes.itemCount > 0, "expected items from sync");
  console.log(`Sync: ${syncRes.itemCount} items`);

  console.log("\n=== 9. create second channel + multi-channel feed ===");
  const { channel: ch2, syncResult: sr2 } = await feedService.createChannel({
    type: "rss",
    name: "Marca Football",
    config: { url: "https://e00-marca.uecdn.es/rss/en/football.xml" },
    tags: ["sports"],
  });
  console.log(`Created: ${ch2.name} (${ch2.id}) — ${sr2.itemCount} items`);

  const allItems = await feedService.getFeed({ limit: 5 });
  const sources = new Set(allItems.map((i) => i.channelId));
  console.log(`Feed has items from ${sources.size} channel(s)`);

  console.log("\n=== 10. delete_channel ===");
  await feedService.deleteChannel(ch2.id);
  const afterDelete = feedService.listChannels();
  assert(afterDelete.length === 1, "expected 1 channel after delete");
  console.log(`Channels remaining: ${afterDelete.length}`);

  console.log("\n=== 11. background sync lifecycle ===");
  syncCoordinator.startBackgroundSync();
  console.log("Background sync started");
  syncCoordinator.stopBackgroundSync();
  console.log("Background sync stopped");

  console.log("\n=== 12. get_channel_types includes youtube ===");
  const types2 = feedService.getChannelTypes();
  assert(types2.length >= 2, "expected at least 2 channel types");
  const ytType = types2.find((t) => t.type === "youtube_podcast");
  assert(!!ytType, "expected youtube_podcast type");
  console.log(`YouTube type: ${ytType!.displayName} — ${ytType!.configSchema.length} config fields`);

  console.log("\n=== 13. create YouTube podcast channel ===");
  // 3Blue1Brown's channel
  const { channel: ytCh, syncResult: ytSync } = await feedService.createChannel({
    type: "youtube_podcast",
    name: "3Blue1Brown",
    config: { channelId: "UCYO_jab_esuFRV4b17AJtAw" },
    tags: ["math", "education"],
  });
  assert(ytSync.itemCount > 0, "expected items from YouTube sync");
  console.log(`Created: ${ytCh.name} (${ytCh.id}) — ${ytSync.itemCount} items`);

  console.log("\n=== 14. get_feed with YouTube items ===");
  const ytItems = await feedService.getFeed({ limit: 3, channelTypes: ["youtube_podcast"] });
  assert(ytItems.length > 0, "expected YouTube items");
  assert(ytItems[0].channelType === "youtube_podcast", "expected youtube_podcast type");
  console.log(renderFeedItems(ytItems));

  console.log("\n=== 15. mixed feed (RSS + YouTube) ===");
  const mixed = await feedService.getFeed({ limit: 6 });
  const mixedTypes = new Set(mixed.map((i) => i.channelType));
  console.log(`Mixed feed has ${mixedTypes.size} channel type(s): ${[...mixedTypes].join(", ")}`);

  console.log("\n=== 16. get_channel_types includes github ===");
  const types3 = feedService.getChannelTypes();
  assert(types3.length === 3, "expected 3 channel types");
  const ghType = types3.find((t) => t.type === "github_trends");
  assert(!!ghType, "expected github_trends type");
  console.log(`GitHub type: ${ghType!.displayName} — ${ghType!.configSchema.length} config fields`);

  console.log("\n=== 17. create GitHub channel ===");
  const { channel: ghCh, syncResult: ghSync } = await feedService.createChannel({
    type: "github_trends",
    name: "MCP SDK",
    config: {
      repos: ["modelcontextprotocol/typescript-sdk"],
      events: ["releases", "commits"],
    },
    tags: ["tech", "mcp"],
  });
  console.log(`Created: ${ghCh.name} (${ghCh.id}) — ${ghSync.itemCount} items`);
  if (ghSync.error) console.log(`  Warning: ${ghSync.error}`);
  assert(!ghSync.error, "expected no error from GitHub sync");
  assert(ghSync.itemCount > 0, "expected items from GitHub sync");

  console.log("\n=== 18. get_feed with GitHub items ===");
  const ghItems = await feedService.getFeed({ limit: 3, channelTypes: ["github_trends"] });
  assert(ghItems.length > 0, "expected GitHub items");
  console.log(renderFeedItems(ghItems));

  console.log("\n=== 19. all-channel mixed feed ===");
  const allMixed = await feedService.getFeed({ limit: 10 });
  const allTypes = new Set(allMixed.map((i) => i.channelType));
  console.log(`Mixed feed from ${allTypes.size} type(s): ${[...allTypes].join(", ")}`);
  console.log(`  Items: ${allMixed.length}`);

  console.log(`\nTotal items in store: ${itemStore.count()}`);
  console.log("\n✅ All 19 tests passed!");

  rmSync(DATA_DIR, { recursive: true, force: true });
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
