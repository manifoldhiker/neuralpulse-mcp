import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { eq, and, sql } from "drizzle-orm";
import { InfoChannel } from "../core/types.js";
import { getDb, schema } from "../db/index.js";

export interface ChannelStore {
  list(userId: string | null, filters?: { type?: string; tags?: string[]; enabled?: boolean }): Promise<InfoChannel[]>;
  get(id: string): Promise<InfoChannel | null>;
  save(userId: string, channel: InfoChannel): Promise<void>;
  delete(id: string): Promise<void>;
}

export class PgChannelStore implements ChannelStore {
  async list(
    userId: string | null,
    filters?: { type?: string; tags?: string[]; enabled?: boolean },
  ): Promise<InfoChannel[]> {
    const db = getDb();
    const conditions: ReturnType<typeof eq>[] = [];

    if (userId) {
      conditions.push(eq(schema.channels.userId, userId));
    }
    if (filters?.type) {
      conditions.push(eq(schema.channels.type, filters.type));
    }
    if (filters?.enabled !== undefined) {
      conditions.push(eq(schema.channels.enabled, filters.enabled));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    let rows = await db
      .select()
      .from(schema.channels)
      .where(where);

    if (filters?.tags && filters.tags.length > 0) {
      const tagSet = new Set(filters.tags);
      rows = rows.filter((r) => (r.tags as string[]).some((t) => tagSet.has(t)));
    }

    return rows.map(rowToInfoChannel);
  }

  async get(id: string): Promise<InfoChannel | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.channels)
      .where(eq(schema.channels.id, id))
      .limit(1);
    return row ? rowToInfoChannel(row) : null;
  }

  async save(userId: string, channel: InfoChannel): Promise<void> {
    const db = getDb();
    await db
      .insert(schema.channels)
      .values({
        id: channel.id,
        userId,
        type: channel.type,
        name: channel.name,
        enabled: channel.enabled,
        config: channel.config,
        tags: channel.tags,
        createdAt: new Date(channel.createdAt),
        updatedAt: new Date(channel.updatedAt),
      })
      .onConflictDoUpdate({
        target: schema.channels.id,
        set: {
          name: channel.name,
          enabled: channel.enabled,
          config: channel.config,
          tags: channel.tags,
          updatedAt: new Date(channel.updatedAt),
        },
      });
  }

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.delete(schema.channels).where(eq(schema.channels.id, id));
  }
}

function rowToInfoChannel(row: typeof schema.channels.$inferSelect): InfoChannel {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    enabled: row.enabled,
    config: row.config,
    tags: row.tags as string[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Legacy JSON store (kept for local stdio dev) ─────────────────

export class JsonChannelStore implements ChannelStore {
  private channels: Map<string, InfoChannel>;

  constructor(private filePath: string) {
    this.channels = new Map();
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const arr: InfoChannel[] = JSON.parse(raw);
      for (const ch of arr) {
        this.channels.set(ch.id, ch);
      }
    } catch {
      // Start fresh if file is corrupt
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + ".tmp";
    writeFileSync(tmp, JSON.stringify([...this.channels.values()], null, 2));
    renameSync(tmp, this.filePath);
  }

  async list(
    _userId: string | null,
    filters?: { type?: string; tags?: string[]; enabled?: boolean },
  ): Promise<InfoChannel[]> {
    let result = [...this.channels.values()];
    if (filters?.type) {
      result = result.filter((ch) => ch.type === filters.type);
    }
    if (filters?.tags && filters.tags.length > 0) {
      const tagSet = new Set(filters.tags);
      result = result.filter((ch) => ch.tags.some((t) => tagSet.has(t)));
    }
    if (filters?.enabled !== undefined) {
      result = result.filter((ch) => ch.enabled === filters.enabled);
    }
    return result;
  }

  async get(id: string): Promise<InfoChannel | null> {
    return this.channels.get(id) ?? null;
  }

  async save(_userId: string, channel: InfoChannel): Promise<void> {
    this.channels.set(channel.id, channel);
    this.persist();
  }

  async delete(id: string): Promise<void> {
    this.channels.delete(id);
    this.persist();
  }
}
