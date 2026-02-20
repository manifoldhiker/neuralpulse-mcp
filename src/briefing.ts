import "dotenv/config";
import cron from "node-cron";
import { summarizeItems } from "./summarize.js";
import { sendBriefing } from "./mailer.js";
import { AdapterRegistry } from "./core/adapter-registry.js";
import { FeedService } from "./core/feed-service.js";
import { SyncCoordinator } from "./core/sync-coordinator.js";
import { PgChannelStore } from "./stores/channel-store.js";
import { PgItemStore } from "./stores/item-store.js";
import { PgSyncStateStore } from "./stores/sync-state-store.js";
import { RssAdapter } from "./adapters/rss.js";
import { YouTubePodcastAdapter } from "./adapters/youtube-podcast.js";
import { GitHubTrendsAdapter } from "./adapters/github-trends.js";
import { getDb, schema } from "./db/index.js";

const requiredEnv = ["ANTHROPIC_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "BRIEFING_RECIPIENT", "DATABASE_URL"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const adapters = new AdapterRegistry();
adapters.register(new RssAdapter());
adapters.register(new YouTubePodcastAdapter());
adapters.register(new GitHubTrendsAdapter());

const channelStore = new PgChannelStore();
const itemStore = new PgItemStore();
const syncStateStore = new PgSyncStateStore();
const syncCoordinator = new SyncCoordinator(adapters, itemStore, syncStateStore, channelStore);
const feedService = new FeedService(channelStore, itemStore, syncCoordinator, adapters);

export async function runBriefingForUser(userId: string): Promise<void> {
  const items = await feedService.getFeed(userId, { limit: 30 });
  if (items.length === 0) return;
  const summary = await summarizeItems(items);
  const subject = `Morning Briefing — ${new Date().toDateString()}`;
  await sendBriefing(subject, summary);
  console.log(`Briefing sent for user ${userId}: ${subject}`);
}

export async function runAllBriefings(): Promise<void> {
  console.log("Running morning briefings...");
  const db = getDb();
  const allUsers = await db.select({ id: schema.users.id }).from(schema.users);
  for (const user of allUsers) {
    try {
      await runBriefingForUser(user.id);
    } catch (err) {
      console.error(`Briefing failed for user ${user.id}:`, err);
    }
  }
}

const cronSchedule = process.env.BRIEFING_CRON ?? "0 7 * * *";
cron.schedule(cronSchedule, async () => {
  try {
    await runAllBriefings();
  } catch (err) {
    console.error("Briefing run failed:", err);
  }
});

console.log(`Morning briefing scheduler started (cron: ${cronSchedule})`);
