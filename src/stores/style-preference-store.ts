import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

export interface StylePreferenceStore {
  get(userId: string): Promise<string | null>;
  set(userId: string, markdown: string): Promise<void>;
}

export class PgStylePreferenceStore implements StylePreferenceStore {
  async get(userId: string): Promise<string | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .limit(1);
    return row?.stylePreference ?? null;
  }

  async set(userId: string, markdown: string): Promise<void> {
    const db = getDb();
    await db
      .insert(schema.userPreferences)
      .values({
        userId,
        stylePreference: markdown,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.userPreferences.userId,
        set: {
          stylePreference: markdown,
          updatedAt: new Date(),
        },
      });
  }
}

// ── Legacy file store (for local stdio dev) ──────────────────────

export class FileStylePreferenceStore implements StylePreferenceStore {
  private cache: Map<string, string> = new Map();

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      const obj: Record<string, string> = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        this.cache.set(k, v);
      }
    } catch {
      // start fresh
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj: Record<string, string> = {};
    for (const [k, v] of this.cache) obj[k] = v;
    const tmp = this.filePath + ".tmp";
    writeFileSync(tmp, JSON.stringify(obj, null, 2));
    renameSync(tmp, this.filePath);
  }

  async get(userId: string): Promise<string | null> {
    return this.cache.get(userId) ?? null;
  }

  async set(userId: string, markdown: string): Promise<void> {
    this.cache.set(userId, markdown);
    this.persist();
  }
}
