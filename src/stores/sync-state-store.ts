import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { eq } from "drizzle-orm";
import { SyncState } from "../core/types.js";
import { getDb, schema } from "../db/index.js";

export interface SyncStateStore {
  get(channelId: string): Promise<SyncState | null>;
  save(state: SyncState): Promise<void>;
  delete(channelId: string): Promise<void>;
  all(): Promise<SyncState[]>;
}

export class PgSyncStateStore implements SyncStateStore {
  async get(channelId: string): Promise<SyncState | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.syncState)
      .where(eq(schema.syncState.channelId, channelId))
      .limit(1);
    return row ? rowToSyncState(row) : null;
  }

  async save(state: SyncState): Promise<void> {
    const db = getDb();
    await db
      .insert(schema.syncState)
      .values({
        channelId: state.channelId,
        lastSyncAt: new Date(state.lastSyncAt),
        lastStatus: state.lastStatus,
        cursor: state.cursor,
        consecutiveFailures: state.consecutiveFailures,
        nextRetryAfter: state.nextRetryAfter ? new Date(state.nextRetryAfter) : null,
        lastError: state.lastError ?? null,
      })
      .onConflictDoUpdate({
        target: schema.syncState.channelId,
        set: {
          lastSyncAt: new Date(state.lastSyncAt),
          lastStatus: state.lastStatus,
          cursor: state.cursor,
          consecutiveFailures: state.consecutiveFailures,
          nextRetryAfter: state.nextRetryAfter ? new Date(state.nextRetryAfter) : null,
          lastError: state.lastError ?? null,
        },
      });
  }

  async delete(channelId: string): Promise<void> {
    const db = getDb();
    await db.delete(schema.syncState).where(eq(schema.syncState.channelId, channelId));
  }

  async all(): Promise<SyncState[]> {
    const db = getDb();
    const rows = await db.select().from(schema.syncState);
    return rows.map(rowToSyncState);
  }
}

function rowToSyncState(row: typeof schema.syncState.$inferSelect): SyncState {
  return {
    channelId: row.channelId,
    lastSyncAt: row.lastSyncAt.toISOString(),
    lastStatus: row.lastStatus,
    cursor: row.cursor ?? null,
    consecutiveFailures: row.consecutiveFailures,
    nextRetryAfter: row.nextRetryAfter?.toISOString(),
    lastError: row.lastError ?? undefined,
  };
}

// ── Legacy JSON store (kept for local stdio dev) ─────────────────

export class JsonSyncStateStore implements SyncStateStore {
  private states = new Map<string, SyncState>();

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const arr: SyncState[] = JSON.parse(raw);
      for (const s of arr) {
        this.states.set(s.channelId, s);
      }
    } catch {
      // Start fresh
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmp = this.filePath + ".tmp";
    writeFileSync(tmp, JSON.stringify([...this.states.values()], null, 2));
    renameSync(tmp, this.filePath);
  }

  async get(channelId: string): Promise<SyncState | null> {
    return this.states.get(channelId) ?? null;
  }

  async save(state: SyncState): Promise<void> {
    this.states.set(state.channelId, state);
    this.persist();
  }

  async delete(channelId: string): Promise<void> {
    this.states.delete(channelId);
    this.persist();
  }

  async all(): Promise<SyncState[]> {
    return [...this.states.values()];
  }
}
