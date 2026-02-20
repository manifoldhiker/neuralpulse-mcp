import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FeedService } from "../core/feed-service.js";
import { SyncStateStore } from "../stores/sync-state-store.js";
import { renderFeedItems, renderChannelTypes, renderChannelList } from "./render.js";

export function registerTools(
  server: McpServer,
  feedService: FeedService,
  syncStates: SyncStateStore,
): void {
  // ── get_feed ──────────────────────────────────────────────────

  server.tool(
    "get_feed",
    "Fetch latest items from your NeuralPulse feed. Returns items from all configured channels, sorted newest-first. Summarize on your side.",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Max items to return (default 20)"),
      channel_ids: z.array(z.string()).optional().describe("Filter to specific channel IDs"),
      channel_types: z.array(z.string()).optional().describe("Filter by channel type (e.g. 'rss', 'youtube_podcast')"),
      tags: z.array(z.string()).optional().describe("Filter by channel tags"),
      query: z.string().optional().describe("Full-text search across titles and snippets"),
      since: z.string().optional().describe("ISO timestamp — only items published after this"),
    },
    async (params) => {
      const items = await feedService.getFeed({
        limit: params.limit,
        channelIds: params.channel_ids,
        channelTypes: params.channel_types,
        tags: params.tags,
        query: params.query,
        since: params.since,
      });
      return { content: [{ type: "text" as const, text: renderFeedItems(items) }] };
    },
  );

  // ── get_channel_types ─────────────────────────────────────────

  server.tool(
    "get_channel_types",
    "List all supported channel types that can be added to your feed, with their config schemas.",
    {},
    async () => {
      const types = feedService.getChannelTypes();
      return { content: [{ type: "text" as const, text: renderChannelTypes(types) }] };
    },
  );

  // ── list_channels ─────────────────────────────────────────────

  server.tool(
    "list_channels",
    "List all configured channels in your feed.",
    {
      type: z.string().optional().describe("Filter by channel type"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
    },
    async (params) => {
      const channels = feedService.listChannels({ type: params.type, tags: params.tags });
      const states = new Map(syncStates.all().map((s) => [s.channelId, s]));
      return { content: [{ type: "text" as const, text: renderChannelList(channels, states) }] };
    },
  );

  // ── create_channel ────────────────────────────────────────────

  server.tool(
    "create_channel",
    "Add a new channel (source) to your feed. Use get_channel_types to see available types and their config.",
    {
      type: z.string().describe("Channel type (e.g. 'rss', 'youtube_podcast', 'github_trends')"),
      name: z.string().describe("Display name for the channel"),
      config: z.record(z.string(), z.unknown()).describe("Type-specific config (see get_channel_types for schema)"),
      tags: z.array(z.string()).optional().describe("Tags for filtering"),
    },
    async (params) => {
      try {
        const { channel, syncResult } = await feedService.createChannel({
          type: params.type,
          name: params.name,
          config: params.config,
          tags: params.tags,
        });
        const msg = `Created channel "${channel.name}" (id: ${channel.id}, type: ${channel.type}).\n` +
          `Initial sync: ${syncResult.itemCount} items fetched.` +
          (syncResult.error ? `\nWarning: ${syncResult.error}` : "");
        return { content: [{ type: "text" as const, text: msg }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
      }
    },
  );

  // ── update_channel ────────────────────────────────────────────

  server.tool(
    "update_channel",
    "Update an existing channel's name, config, tags, or enabled state.",
    {
      channel_id: z.string().describe("ID of the channel to update"),
      name: z.string().optional().describe("New display name"),
      config: z.record(z.string(), z.unknown()).optional().describe("New type-specific config"),
      tags: z.array(z.string()).optional().describe("New tags"),
      enabled: z.boolean().optional().describe("Enable or disable the channel"),
    },
    async (params) => {
      try {
        const updated = await feedService.updateChannel(params.channel_id, {
          name: params.name,
          config: params.config,
          tags: params.tags,
          enabled: params.enabled,
        });
        return { content: [{ type: "text" as const, text: `Updated channel "${updated.name}" (id: ${updated.id}).` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
      }
    },
  );

  // ── delete_channel ────────────────────────────────────────────

  server.tool(
    "delete_channel",
    "Remove a channel from your feed.",
    {
      channel_id: z.string().describe("ID of the channel to delete"),
    },
    async (params) => {
      try {
        await feedService.deleteChannel(params.channel_id);
        return { content: [{ type: "text" as const, text: `Deleted channel "${params.channel_id}".` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
      }
    },
  );

  // ── sync_channel ──────────────────────────────────────────────

  server.tool(
    "sync_channel",
    "Force an immediate refresh of a specific channel, bypassing TTL.",
    {
      channel_id: z.string().describe("ID of the channel to sync"),
    },
    async (params) => {
      try {
        const result = await feedService.syncChannel(params.channel_id);
        const msg = `Synced channel "${params.channel_id}": ${result.itemCount} items.` +
          (result.error ? `\nError: ${result.error}` : "");
        return { content: [{ type: "text" as const, text: msg }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
      }
    },
  );
}
