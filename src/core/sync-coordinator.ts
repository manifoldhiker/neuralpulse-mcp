import { AdapterRegistry } from "./adapter-registry.js";
import { InfoChannel, SyncState } from "./types.js";
import { ItemStore } from "../stores/item-store.js";
import { SyncStateStore } from "../stores/sync-state-store.js";
import { ChannelStore } from "../stores/channel-store.js";

// ── Semaphore for concurrency control ─────────────────────────

class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

// ── Rate budget tracking per adapter type ─────────────────────

interface RateBudget {
  remaining: number;
  resetAt: number;
  threshold: number;
}

export interface SyncCoordinatorOptions {
  globalConcurrency?: number;
  backgroundIntervalMs?: number;
}

export class SyncCoordinator {
  private syncing = new Set<string>();
  private globalSemaphore: Semaphore;
  private adapterSemaphores = new Map<string, Semaphore>();
  private rateBudgets = new Map<string, RateBudget>();
  private backgroundTimer: ReturnType<typeof setInterval> | null = null;
  private backgroundIntervalMs: number;
  private syncStateCache = new Map<string, SyncState>();

  constructor(
    private adapters: AdapterRegistry,
    private items: ItemStore,
    private syncStates: SyncStateStore,
    private channels?: ChannelStore,
    private backgroundUserId?: string | null,
    options?: SyncCoordinatorOptions,
  ) {
    this.globalSemaphore = new Semaphore(options?.globalConcurrency ?? 8);
    this.backgroundIntervalMs = options?.backgroundIntervalMs ?? 30_000;

    for (const adapter of adapters.all()) {
      this.adapterSemaphores.set(adapter.type, new Semaphore(adapter.maxConcurrency));
    }
  }

  // ── Background loop lifecycle ───────────────────────────────

  startBackgroundSync(): void {
    if (this.backgroundTimer) return;
    this.backgroundTimer = setInterval(() => this.backgroundTick(), this.backgroundIntervalMs);
    this.backgroundTick();
  }

  stopBackgroundSync(): void {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  private async backgroundTick(): Promise<void> {
    if (!this.channels) return;
    const userId = this.backgroundUserId ?? null;
    const enabled = await this.channels.list(userId, { enabled: true });
    const stale: InfoChannel[] = [];
    for (const ch of enabled) {
      if (await this.isStale(ch)) stale.push(ch);
    }
    if (stale.length === 0) return;
    await Promise.allSettled(stale.map((ch) => this.syncOne(ch)));
  }

  // ── On-demand sync ──────────────────────────────────────────

  async ensureFresh(channels: InfoChannel[]): Promise<void> {
    const stale: InfoChannel[] = [];
    for (const ch of channels) {
      if (ch.enabled && (await this.isStale(ch))) stale.push(ch);
    }
    if (stale.length === 0) return;
    await Promise.allSettled(stale.map((ch) => this.syncOne(ch)));
  }

  async syncNow(channel: InfoChannel): Promise<{ itemCount: number; error?: string }> {
    return this.syncOne(channel, true);
  }

  // ── Staleness check ─────────────────────────────────────────

  private async isStale(channel: InfoChannel): Promise<boolean> {
    const state = await this.syncStates.get(channel.id);
    if (!state) return true;

    if (state.lastStatus === "error" && state.nextRetryAfter) {
      if (Date.now() < new Date(state.nextRetryAfter).getTime()) return false;
    }

    const adapter = this.adapters.get(channel.type);
    const ttl = (channel.config.ttlMinutes as number) ?? adapter.defaultTtlMinutes;
    const elapsed = Date.now() - new Date(state.lastSyncAt).getTime();
    return elapsed > ttl * 60_000;
  }

  // ── Core sync pipeline ──────────────────────────────────────

  private async syncOne(
    channel: InfoChannel,
    force = false,
  ): Promise<{ itemCount: number; error?: string }> {
    if (this.syncing.has(channel.id)) return { itemCount: 0 };

    if (!force && this.isRateLimited(channel.type)) {
      return { itemCount: 0, error: "rate limited" };
    }

    this.syncing.add(channel.id);
    const adapterSem = this.adapterSemaphores.get(channel.type);

    await this.globalSemaphore.acquire();
    if (adapterSem) await adapterSem.acquire();

    try {
      const adapter = this.adapters.get(channel.type);
      const prevState = await this.syncStates.get(channel.id);
      const result = await adapter.sync(channel, prevState?.cursor ?? null);

      await this.items.upsert(result.items);

      if (result.rateLimitRemaining !== undefined) {
        this.rateBudgets.set(channel.type, {
          remaining: result.rateLimitRemaining,
          resetAt: result.rateLimitResetAt ? new Date(result.rateLimitResetAt).getTime() : Date.now() + 3600_000,
          threshold: 50,
        });
      }

      await this.syncStates.save({
        channelId: channel.id,
        lastSyncAt: new Date().toISOString(),
        lastStatus: "ok",
        cursor: result.nextCursor,
        consecutiveFailures: 0,
      });

      return { itemCount: result.items.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const prevState = await this.syncStates.get(channel.id);
      const failures = (prevState?.consecutiveFailures ?? 0) + 1;

      const backoffMs = Math.min(1000 * Math.pow(2, failures), 30 * 60_000);
      const nextRetry = new Date(Date.now() + backoffMs).toISOString();

      await this.syncStates.save({
        channelId: channel.id,
        lastSyncAt: new Date().toISOString(),
        lastStatus: "error",
        cursor: prevState?.cursor ?? null,
        consecutiveFailures: failures,
        nextRetryAfter: nextRetry,
        lastError: msg,
      });

      return { itemCount: 0, error: msg };
    } finally {
      if (adapterSem) adapterSem.release();
      this.globalSemaphore.release();
      this.syncing.delete(channel.id);
    }
  }

  // ── Rate budget check ───────────────────────────────────────

  private isRateLimited(adapterType: string): boolean {
    const budget = this.rateBudgets.get(adapterType);
    if (!budget) return false;
    if (Date.now() > budget.resetAt) {
      this.rateBudgets.delete(adapterType);
      return false;
    }
    return budget.remaining <= budget.threshold;
  }
}
