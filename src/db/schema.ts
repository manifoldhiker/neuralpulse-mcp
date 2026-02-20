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
