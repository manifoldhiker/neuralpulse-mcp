import { eq, inArray, and, gte, ilike, or, desc, sql, lt } from "drizzle-orm";
import { NormalizedItem } from "../core/types.js";
import { getDb, schema } from "../db/index.js";

export interface ItemQueryFilters {
  channelIds?: string[];
  channelTypes?: string[];
  tags?: string[];
  query?: string;
  since?: string;
  limit: number;
}

export interface ItemStore {
  upsert(items: NormalizedItem[]): Promise<void>;
  query(filters: ItemQueryFilters, channelTags?: Map<string, string[]>): Promise<NormalizedItem[]>;
  deleteByChannel(channelId: string): Promise<void>;
  prune(olderThan: Date): Promise<void>;
  count(): Promise<number>;
}

export class PgItemStore implements ItemStore {
  async upsert(items: NormalizedItem[]): Promise<void> {
    if (items.length === 0) return;
    const db = getDb();

    const values = items.map((item) => ({
      id: item.id,
      channelId: item.channelId,
      channelType: item.channelType,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      snippet: item.snippet,
      author: item.author ?? null,
      meta: (item.meta as Record<string, unknown>) ?? null,
    }));

    for (const val of values) {
      await db
        .insert(schema.feedItems)
        .values(val)
        .onConflictDoUpdate({
          target: schema.feedItems.id,
          set: {
            title: val.title,
            url: val.url,
            publishedAt: val.publishedAt,
            snippet: val.snippet,
            author: val.author,
            meta: val.meta,
          },
        });
    }
  }

  async query(
    filters: ItemQueryFilters,
    channelTags?: Map<string, string[]>,
  ): Promise<NormalizedItem[]> {
    const db = getDb();
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters.channelIds && filters.channelIds.length > 0) {
      conditions.push(inArray(schema.feedItems.channelId, filters.channelIds));
    }
    if (filters.channelTypes && filters.channelTypes.length > 0) {
      conditions.push(inArray(schema.feedItems.channelType, filters.channelTypes));
    }
    if (filters.since) {
      conditions.push(gte(schema.feedItems.publishedAt, new Date(filters.since)));
    }
    if (filters.query) {
      const needle = `%${filters.query}%`;
      conditions.push(
        or(
          ilike(schema.feedItems.title, needle),
          ilike(schema.feedItems.snippet, needle),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    let rows = await db
      .select()
      .from(schema.feedItems)
      .where(where)
      .orderBy(desc(schema.feedItems.publishedAt))
      .limit(filters.limit);

    if (filters.tags && filters.tags.length > 0 && channelTags) {
      const tagSet = new Set(filters.tags);
      rows = rows.filter((r) => {
        const tags = channelTags.get(r.channelId) ?? [];
        return tags.some((t) => tagSet.has(t));
      });
    }

    return rows.map(rowToNormalizedItem);
  }

  async deleteByChannel(channelId: string): Promise<void> {
    const db = getDb();
    await db.delete(schema.feedItems).where(eq(schema.feedItems.channelId, channelId));
  }

  async prune(olderThan: Date): Promise<void> {
    const db = getDb();
    await db.delete(schema.feedItems).where(lt(schema.feedItems.publishedAt, olderThan));
  }

  async count(): Promise<number> {
    const db = getDb();
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.feedItems);
    return row?.count ?? 0;
  }
}

function rowToNormalizedItem(row: typeof schema.feedItems.$inferSelect): NormalizedItem {
  return {
    id: row.id,
    channelId: row.channelId,
    channelType: row.channelType,
    title: row.title,
    url: row.url,
    publishedAt: row.publishedAt?.toISOString() ?? "",
    snippet: row.snippet,
    author: row.author ?? undefined,
    meta: (row.meta as Record<string, unknown>) ?? undefined,
  };
}

// ── Legacy in-memory store (kept for local stdio dev) ────────────

export class InMemoryItemStore implements ItemStore {
  private items = new Map<string, NormalizedItem>();

  async upsert(items: NormalizedItem[]): Promise<void> {
    for (const item of items) {
      this.items.set(item.id, item);
    }
  }

  async query(
    filters: ItemQueryFilters,
    channelTags?: Map<string, string[]>,
  ): Promise<NormalizedItem[]> {
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

  async deleteByChannel(channelId: string): Promise<void> {
    for (const [id, item] of this.items) {
      if (item.channelId === channelId) {
        this.items.delete(id);
      }
    }
  }

  async prune(olderThan: Date): Promise<void> {
    const cutoff = olderThan.getTime();
    for (const [id, item] of this.items) {
      const pubMs = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
      if (pubMs > 0 && pubMs < cutoff) {
        this.items.delete(id);
      }
    }
  }

  async count(): Promise<number> {
    return this.items.size;
  }
}
