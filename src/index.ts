import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getFeed } from "./feeds.js";

const server = new McpServer({
  name: "neuralpulse",
  version: "1.0.0",
});

server.tool(
  "get_feed",
  "Fetch latest items from your SmartFeed subscriptions. Returns raw entries (title, link, date, snippet) — summarise on your side.",
  {
    limit: z.number().int().min(1).max(100).optional().describe("Max items to return (default 20)"),
    source: z.string().optional().describe("Filter by feed name or URL substring"),
  },
  async ({ limit, source }) => {
    const items = await getFeed({ limit, source });

    if (items.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: source
              ? `No items found for source "${source}". Check available feeds in feeds.json.`
              : "No feed items found. Your feeds may be unreachable.",
          },
        ],
      };
    }

    const text = items
      .map(
        (item, i) =>
          `[${i + 1}] ${item.title}\n    Source: ${item.source}\n    Link: ${item.link}\n    Date: ${item.published}\n    ${item.snippet}`
      )
      .join("\n\n");

    return {
      content: [{ type: "text" as const, text }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
