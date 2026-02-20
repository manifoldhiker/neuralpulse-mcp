import "dotenv/config";
import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { AdapterRegistry } from "./core/adapter-registry.js";
import { FeedService } from "./core/feed-service.js";
import { SyncCoordinator } from "./core/sync-coordinator.js";
import { PgChannelStore } from "./stores/channel-store.js";
import { PgItemStore } from "./stores/item-store.js";
import { PgSyncStateStore } from "./stores/sync-state-store.js";
import { RssAdapter } from "./adapters/rss.js";
import { YouTubePodcastAdapter } from "./adapters/youtube-podcast.js";
import { GitHubTrendsAdapter } from "./adapters/github-trends.js";
import { registerTools } from "./mcp/tools.js";
import { clerkMiddleware, requireAuth, resolveUserId } from "./auth/middleware.js";
import { summarizeItems } from "./summarize.js";
import { closeDb } from "./db/index.js";

// ── Adapter registry ────────────────────────────────────────────

const adapters = new AdapterRegistry();
adapters.register(new RssAdapter());
adapters.register(new YouTubePodcastAdapter());
adapters.register(new GitHubTrendsAdapter());

// ── Stores (PostgreSQL-backed) ──────────────────────────────────

const channelStore = new PgChannelStore();
const itemStore = new PgItemStore();
const syncStateStore = new PgSyncStateStore();

// ── Core services ───────────────────────────────────────────────

const syncCoordinator = new SyncCoordinator(adapters, itemStore, syncStateStore, channelStore);
const feedService = new FeedService(channelStore, itemStore, syncCoordinator, adapters);

// ── Express app ─────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true, credentials: true }));

// ── Health (before auth middleware) ─────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "neuralpulse", version: "2.0.0" });
});

app.use(clerkMiddleware);

// ── REST API ────────────────────────────────────────────────────

app.get("/api/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    res.json({ userId });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve user" });
  }
});

app.get("/api/channels", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const channels = await feedService.listChannels(userId);
    res.json({ channels });
  } catch (err) {
    res.status(500).json({ error: "Failed to list channels" });
  }
});

app.get("/api/feed", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const items = await feedService.getFeed(userId, {
      limit: Number(req.query.limit) || 20,
      channelTypes: req.query.types ? String(req.query.types).split(",") : undefined,
      tags: req.query.tags ? String(req.query.tags).split(",") : undefined,
      query: req.query.q as string | undefined,
      since: req.query.since as string | undefined,
    });
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch feed" });
  }
});

app.get("/api/briefing", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = await resolveUserId(req);
    const items = await feedService.getFeed(userId, {
      limit: Number(req.query.limit) || 30,
      tags: req.query.tags ? String(req.query.tags).split(",") : undefined,
      since: req.query.since as string | undefined,
    });
    if (items.length === 0) {
      res.json({ summary: "No recent items to summarize." });
      return;
    }
    const summary = await summarizeItems(items);
    res.json({ summary, itemCount: items.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Briefing failed: ${msg}` });
  }
});

// ── MCP over StreamableHTTP ─────────────────────────────────────

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  userId: string;
}
const sessions = new Map<string, SessionEntry>();

function createMcpServerForUser(userId: string): McpServer {
  const server = new McpServer({ name: "neuralpulse", version: "2.0.0" });
  registerTools(server, feedService, syncStateStore, () => userId);
  return server;
}

app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let entry: SessionEntry | undefined;

  if (sessionId && sessions.has(sessionId)) {
    entry = sessions.get(sessionId)!;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    try {
      const userId = await resolveUserId(req);
      const mcpServer = createMcpServerForUser(userId);
      let currentTransport: StreamableHTTPServerTransport;

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport: currentTransport, server: mcpServer, userId });
        },
      });
      currentTransport = transport;

      await mcpServer.connect(transport);
      entry = { transport, server: mcpServer, userId };
    } catch (err) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
  } else {
    res.status(400).json({ error: "Invalid or missing session" });
    return;
  }

  await entry.transport.handleRequest(req, res, req.body);
});

app.get("/mcp", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const entry = sessions.get(sessionId);
  if (entry) {
    await entry.transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "Invalid or missing session" });
  }
});

app.delete("/mcp", async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const entry = sessions.get(sessionId);
  if (entry) {
    await entry.transport.handleRequest(req, res);
    sessions.delete(sessionId);
  } else {
    res.status(400).json({ error: "Invalid or missing session" });
  }
});

// ── Start ───────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000);

syncCoordinator.startBackgroundSync();

const httpServer = app.listen(PORT, () => {
  console.log(`NeuralPulse server running on http://localhost:${PORT}`);
  console.log(`  MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`  API endpoint: http://localhost:${PORT}/api`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
});

async function shutdown() {
  console.log("Shutting down...");
  syncCoordinator.stopBackgroundSync();
  httpServer.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
