import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";

// ── Users ────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
});

// ── Channels (replaces channels.json) ────────────────────────────

export const channels = pgTable(
  "channels",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    config: jsonb("config").notNull().$type<Record<string, unknown>>(),
    tags: text("tags").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("channels_user_id_idx").on(t.userId)],
);

// ── Feed items (replaces InMemoryItemStore) ──────────────────────

export const feedItems = pgTable(
  "feed_items",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    channelType: varchar("channel_type", { length: 50 }).notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    snippet: text("snippet").notNull().default(""),
    author: text("author"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("feed_items_channel_id_idx").on(t.channelId),
    index("feed_items_published_at_idx").on(t.publishedAt),
  ],
);

// ── OAuth clients (RFC 7591 dynamic registration) ────────────────

export const oauthClients = pgTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientSecret: text("client_secret"),
  clientSecretExpiresAt: integer("client_secret_expires_at"),
  redirectUris: jsonb("redirect_uris").notNull().$type<string[]>(),
  clientName: text("client_name"),
  metadata: jsonb("metadata").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── OAuth pending authorization requests ─────────────────────────

export const oauthAuthRequests = pgTable("oauth_auth_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  state: text("state"),
  codeChallenge: text("code_challenge").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  resource: text("resource"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ── OAuth authorization codes ────────────────────────────────────

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  code: text("code").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  resource: text("resource"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ── OAuth tokens (access + refresh) ─────────────────────────────

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    token: text("token").primaryKey(),
    type: varchar("type", { length: 10 }).notNull().$type<"access" | "refresh">(),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes").array().notNull().default([]),
    resource: text("resource"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("oauth_tokens_user_id_idx").on(t.userId),
    index("oauth_tokens_client_id_idx").on(t.clientId),
  ],
);

// ── Sync state (replaces sync-state.json) ────────────────────────

export const syncState = pgTable("sync_state", {
  channelId: text("channel_id")
    .primaryKey()
    .references(() => channels.id, { onDelete: "cascade" }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }).notNull(),
  lastStatus: varchar("last_status", { length: 20 }).notNull().$type<"ok" | "error" | "rate_limited">(),
  cursor: jsonb("cursor").$type<{ data: Record<string, unknown> } | null>(),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  nextRetryAfter: timestamp("next_retry_after", { withTimezone: true }),
  lastError: text("last_error"),
});
