import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { SyncState } from "../core/types.js";

export interface SyncStateStore {
  get(channelId: string): SyncState | null;
  save(state: SyncState): void;
  delete(channelId: string): void;
  all(): SyncState[];
}

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

  get(channelId: string): SyncState | null {
    return this.states.get(channelId) ?? null;
  }

  save(state: SyncState): void {
    this.states.set(state.channelId, state);
    this.persist();
  }

  delete(channelId: string): void {
    this.states.delete(channelId);
    this.persist();
  }

  all(): SyncState[] {
    return [...this.states.values()];
  }
}
