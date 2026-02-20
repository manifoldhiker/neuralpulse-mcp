import Anthropic from "@anthropic-ai/sdk";
import { NormalizedItem } from "./core/types.js";

export async function summarizeItems(items: NormalizedItem[]): Promise<string> {
  const client = new Anthropic();

  const userMessage = items
    .map(
      (item, i) =>
        `${i + 1}. ${item.title} — ${item.channelType}:${item.channelId} (${item.publishedAt})\n${item.snippet}`,
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system:
      "You are a concise morning briefing writer. Summarize the provided news items into a short, scannable digest. Group related items when possible. Use plain text with no markdown.",
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }
  return block.text;
}
