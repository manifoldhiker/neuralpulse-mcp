import { NormalizedItem, ChannelTypeDescriptor, InfoChannel } from "../core/types.js";
import { SyncState } from "../core/types.js";

export function renderFeedItems(items: NormalizedItem[]): string {
  if (items.length === 0) return "No feed items found.";

  return items
    .map(
      (item, i) =>
        `[${i + 1}] ${item.title}\n` +
        `    Source: ${item.channelType}:${item.channelId}\n` +
        `    Link: ${item.url}\n` +
        `    Date: ${item.publishedAt}\n` +
        `    ${item.snippet}`,
    )
    .join("\n\n");
}

export function renderChannelTypes(types: ChannelTypeDescriptor[]): string {
  if (types.length === 0) return "No channel types registered.";

  return types
    .map((t) => {
      const fields = t.configSchema
        .map((f) => `      - ${f.name} (${f.type}${f.required ? ", required" : ""}): ${f.description}`)
        .join("\n");
      return `• ${t.displayName} [type: "${t.type}"]\n  ${t.description}\n  Config:\n${fields}`;
    })
    .join("\n\n");
}

export function renderChannelList(channels: InfoChannel[], syncStates?: Map<string, SyncState>): string {
  if (channels.length === 0) return "No channels configured.";

  return channels
    .map((ch) => {
      const state = syncStates?.get(ch.id);
      const status = state ? `${state.lastStatus} (synced ${state.lastSyncAt})` : "never synced";
      const tags = ch.tags.length > 0 ? ` [${ch.tags.join(", ")}]` : "";
      return `• ${ch.name} (${ch.type}, id: "${ch.id}")${tags}\n  Enabled: ${ch.enabled} | Status: ${status}`;
    })
    .join("\n\n");
}
