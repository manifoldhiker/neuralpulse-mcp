// ── NormalizedItem: the atom of the Feed ──────────────────────────

export interface NormalizedItem {
  id: string;
  channelId: string;
  channelType: string;
  title: string;
  url: string;
  publishedAt: string;
  snippet: string;
  author?: string;
  meta?: Record<string, unknown>;
}

// ── InfoChannel: a configured source ──────────────────────────────

export interface InfoChannel {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Adapter contract ──────────────────────────────────────────────

export interface ConfigFieldDescriptor {
  name: string;
  type: "string" | "number" | "boolean" | "string[]";
  required: boolean;
  description: string;
}

export interface ValidationResult {
  ok: boolean;
  displayName?: string;
  error?: string;
}

export interface SyncCursor {
  data: Record<string, unknown>;
}

export interface SyncResult {
  items: NormalizedItem[];
  nextCursor: SyncCursor;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
}

export interface ChannelAdapter {
  readonly type: string;
  readonly displayName: string;
  readonly description: string;
  readonly defaultTtlMinutes: number;
  readonly maxConcurrency: number;

  describeConfig(): ConfigFieldDescriptor[];
  validate(config: Record<string, unknown>): Promise<ValidationResult>;
  sync(channel: InfoChannel, cursor: SyncCursor | null): Promise<SyncResult>;
}

// ── Sync state ────────────────────────────────────────────────────

export interface SyncState {
  channelId: string;
  lastSyncAt: string;
  lastStatus: "ok" | "error" | "rate_limited";
  cursor: SyncCursor | null;
  consecutiveFailures: number;
  nextRetryAfter?: string;
  lastError?: string;
}

// ── Query types ───────────────────────────────────────────────────

export interface FeedQuery {
  limit?: number;
  channelIds?: string[];
  channelTypes?: string[];
  tags?: string[];
  query?: string;
  since?: string;
}

export interface ChannelTypeDescriptor {
  type: string;
  displayName: string;
  description: string;
  configSchema: ConfigFieldDescriptor[];
}
