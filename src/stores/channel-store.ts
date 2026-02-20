import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { InfoChannel } from "../core/types.js";

export interface ChannelStore {
  list(filters?: { type?: string; tags?: string[]; enabled?: boolean }): InfoChannel[];
  get(id: string): InfoChannel | null;
  save(channel: InfoChannel): void;
  delete(id: string): void;
}

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

  list(filters?: { type?: string; tags?: string[]; enabled?: boolean }): InfoChannel[] {
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

  get(id: string): InfoChannel | null {
    return this.channels.get(id) ?? null;
  }

  save(channel: InfoChannel): void {
    this.channels.set(channel.id, channel);
    this.persist();
  }

  delete(id: string): void {
    this.channels.delete(id);
    this.persist();
  }
}
