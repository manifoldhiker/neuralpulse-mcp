import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StylePreferenceStore } from "../stores/style-preference-store.js";
import type { UserIdResolver } from "./tools.js";

const DEFAULT_STYLE = `You are presenting a personalized news/content briefing.
Be concise and scannable. Use short paragraphs, bullet points, and bold key terms.
Group items by topic. Include source links. Skip filler — lead with what matters.`;

export function registerPrompts(
  server: McpServer,
  styleStore: StylePreferenceStore,
  getUserId: UserIdResolver,
): void {
  server.prompt(
    "style_preference",
    "Returns the user's saved content-presentation style preference as a system message. " +
      "Attach this prompt when rendering feed items or briefings so the output matches the user's preferred style.",
    async () => {
      const userId = getUserId();
      const pref = await styleStore.get(userId);
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: pref ?? DEFAULT_STYLE,
            },
          },
        ],
      };
    },
  );
}
