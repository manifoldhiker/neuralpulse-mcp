import { AdapterRegistry } from "./adapter-registry.js";
import { SyncCoordinator } from "./sync-coordinator.js";
import {
  ChannelTypeDescriptor,
  FeedQuery,
  InfoChannel,
  NormalizedItem,
} from "./types.js";
import { ChannelStore } from "../stores/channel-store.js";
import { ItemStore } from "../stores/item-store.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function makeUniqueId(base: string, exists: (id: string) => boolean): string {
  if (!exists(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export class FeedService {
  constructor(
    private channels: ChannelStore,
    private items: ItemStore,
    private sync: SyncCoordinator,
    private adapters: AdapterRegistry,
  ) {}

  // ── Feed query ───────────────────────────────────────────────

  async getFeed(query: FeedQuery): Promise<NormalizedItem[]> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    let channels = this.channels.list({ enabled: true });

    if (query.channelIds?.length) {
      const idSet = new Set(query.channelIds);
      channels = channels.filter((ch) => idSet.has(ch.id));
    }
    if (query.channelTypes?.length) {
      const typeSet = new Set(query.channelTypes);
      channels = channels.filter((ch) => typeSet.has(ch.type));
    }
    if (query.tags?.length) {
      const tagSet = new Set(query.tags);
      channels = channels.filter((ch) => ch.tags.some((t) => tagSet.has(t)));
    }

    await this.sync.ensureFresh(channels);

    const channelTags = new Map(channels.map((ch) => [ch.id, ch.tags]));

    return this.items.query(
      {
        channelIds: channels.map((ch) => ch.id),
        channelTypes: query.channelTypes,
        tags: query.tags,
        query: query.query,
        since: query.since,
        limit,
      },
      channelTags,
    );
  }

  // ── Channel CRUD ─────────────────────────────────────────────

  listChannels(filters?: { type?: string; tags?: string[] }): InfoChannel[] {
    return this.channels.list(filters);
  }

  async createChannel(params: {
    type: string;
    name: string;
    config: Record<string, unknown>;
    tags?: string[];
  }): Promise<{ channel: InfoChannel; syncResult: { itemCount: number; error?: string } }> {
    const adapter = this.adapters.get(params.type);
    const validation = await adapter.validate(params.config);
    if (!validation.ok) {
      throw new Error(`Channel validation failed: ${validation.error}`);
    }

    const displayName = validation.displayName ?? params.name;
    const id = makeUniqueId(slugify(displayName), (id) => this.channels.get(id) !== null);
    const now = new Date().toISOString();

    const channel: InfoChannel = {
      id,
      type: params.type,
      name: displayName,
      enabled: true,
      config: params.config,
      tags: params.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.channels.save(channel);
    const syncResult = await this.sync.syncNow(channel);

    return { channel, syncResult };
  }

  async updateChannel(
    id: string,
    patch: { name?: string; config?: Record<string, unknown>; tags?: string[]; enabled?: boolean },
  ): Promise<InfoChannel> {
    const existing = this.channels.get(id);
    if (!existing) throw new Error(`Channel not found: ${id}`);

    if (patch.config) {
      const adapter = this.adapters.get(existing.type);
      const validation = await adapter.validate(patch.config);
      if (!validation.ok) {
        throw new Error(`Channel validation failed: ${validation.error}`);
      }
    }

    const updated: InfoChannel = {
      ...existing,
      name: patch.name ?? existing.name,
      config: patch.config ?? existing.config,
      tags: patch.tags ?? existing.tags,
      enabled: patch.enabled ?? existing.enabled,
      updatedAt: new Date().toISOString(),
    };

    this.channels.save(updated);
    return updated;
  }

  async deleteChannel(id: string): Promise<void> {
    const existing = this.channels.get(id);
    if (!existing) throw new Error(`Channel not found: ${id}`);
    this.channels.delete(id);
    this.items.deleteByChannel(id);
  }

  // ── Introspection ────────────────────────────────────────────

  getChannelTypes(): ChannelTypeDescriptor[] {
    return this.adapters.describeAll();
  }

  // ── Sync ─────────────────────────────────────────────────────

  async syncChannel(id: string): Promise<{ itemCount: number; error?: string }> {
    const channel = this.channels.get(id);
    if (!channel) throw new Error(`Channel not found: ${id}`);
    return this.sync.syncNow(channel);
  }
}
