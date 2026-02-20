import { NormalizedItem } from "../core/types.js";

export interface ItemQueryFilters {
  channelIds?: string[];
  channelTypes?: string[];
  tags?: string[];
  query?: string;
  since?: string;
  limit: number;
}

export interface ItemStore {
  upsert(items: NormalizedItem[]): void;
  query(filters: ItemQueryFilters, channelTags?: Map<string, string[]>): NormalizedItem[];
  deleteByChannel(channelId: string): void;
  prune(olderThan: Date): void;
  count(): number;
}

export class InMemoryItemStore implements ItemStore {
  private items = new Map<string, NormalizedItem>();

  upsert(items: NormalizedItem[]): void {
    for (const item of items) {
      this.items.set(item.id, item);
    }
  }

  query(filters: ItemQueryFilters, channelTags?: Map<string, string[]>): NormalizedItem[] {
    let result = [...this.items.values()];

    if (filters.channelIds && filters.channelIds.length > 0) {
      const idSet = new Set(filters.channelIds);
      result = result.filter((it) => idSet.has(it.channelId));
    }

    if (filters.channelTypes && filters.channelTypes.length > 0) {
      const typeSet = new Set(filters.channelTypes);
      result = result.filter((it) => typeSet.has(it.channelType));
    }

    if (filters.tags && filters.tags.length > 0 && channelTags) {
      const tagSet = new Set(filters.tags);
      result = result.filter((it) => {
        const tags = channelTags.get(it.channelId) ?? [];
        return tags.some((t) => tagSet.has(t));
      });
    }

    if (filters.query) {
      const needle = filters.query.toLowerCase();
      result = result.filter(
        (it) =>
          it.title.toLowerCase().includes(needle) ||
          it.snippet.toLowerCase().includes(needle),
      );
    }

    if (filters.since) {
      const sinceMs = new Date(filters.since).getTime();
      result = result.filter((it) => {
        const pubMs = it.publishedAt ? new Date(it.publishedAt).getTime() : 0;
        return pubMs >= sinceMs;
      });
    }

    result.sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return db - da;
    });

    return result.slice(0, filters.limit);
  }

  deleteByChannel(channelId: string): void {
    for (const [id, item] of this.items) {
      if (item.channelId === channelId) {
        this.items.delete(id);
      }
    }
  }

  prune(olderThan: Date): void {
    const cutoff = olderThan.getTime();
    for (const [id, item] of this.items) {
      const pubMs = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
      if (pubMs > 0 && pubMs < cutoff) {
        this.items.delete(id);
      }
    }
  }

  count(): number {
    return this.items.size;
  }
}
