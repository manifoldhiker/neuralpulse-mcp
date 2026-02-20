import "dotenv/config";
import cron from "node-cron";
import { getFeed } from "./feeds.js";
import { summarizeItems } from "./summarize.js";
import { sendBriefing } from "./mailer.js";

const requiredEnv = ["ANTHROPIC_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "BRIEFING_RECIPIENT"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

export async function runBriefing(): Promise<void> {
  console.log("Running morning briefing...");
  const items = await getFeed({ limit: 30 });
  const summary = await summarizeItems(items);
  const subject = `Morning Briefing — ${new Date().toDateString()}`;
  await sendBriefing(subject, summary);
  console.log(`Briefing sent: ${subject}`);
}

const cronSchedule = process.env.BRIEFING_CRON ?? "0 7 * * *";
cron.schedule(cronSchedule, async () => {
  try {
    await runBriefing();
  } catch (err) {
    console.error("Briefing failed:", err);
  }
});

console.log(`Morning briefing scheduler started (cron: ${cronSchedule})`);
