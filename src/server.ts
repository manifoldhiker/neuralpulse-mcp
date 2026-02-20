import "dotenv/config";
import { randomUUID, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";

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
import { registerResources } from "./mcp/resources.js";
import { clerkMiddleware, requireAuth, resolveUserId } from "./auth/middleware.js";
import { NeuralPulseOAuthProvider } from "./auth/oauth-provider.js";
import { summarizeItems } from "./summarize.js";
import { getDb, closeDb, schema } from "./db/index.js";

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

// ── OAuth provider ──────────────────────────────────────────────

const oauthProvider = new NeuralPulseOAuthProvider();

const PORT = Number(process.env.PORT ?? 3000);
const serverUrl =
  process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== "*"
    ? process.env.CORS_ORIGIN
    : `http://localhost:${PORT}`;

// ── Express app ─────────────────────────────────────────────────

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true, credentials: true }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Health (before auth middleware) ─────────────────────────────

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "neuralpulse", version: "2.0.0" });
});

// ── OAuth auth router (before Clerk middleware) ─────────────────

app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(serverUrl),
    baseUrl: new URL(serverUrl),
    scopesSupported: ["mcp:read_feed", "mcp:write_subscriptions"],
    resourceName: "NeuralPulse MCP",
    resourceServerUrl: new URL(serverUrl),
  }),
);

app.get("/oauth/clerk-config", (_req: Request, res: Response) => {
  res.json({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? "" });
});

app.get("/oauth/login", (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "oauth-login.html"));
});

// ── Clerk middleware (for web app + /oauth/approve) ─────────────

app.use(clerkMiddleware);

// ── OAuth approve (requires Clerk session) ──────────────────────

app.post("/oauth/approve", requireAuth, async (req: Request, res: Response) => {
  try {
    const authReqId = req.body.auth_req;
    if (!authReqId) {
      res.status(400).json({ error: "Missing auth_req" });
      return;
    }

    const db = getDb();
    const [authReq] = await db
      .select()
      .from(schema.oauthAuthRequests)
      .where(eq(schema.oauthAuthRequests.id, authReqId))
      .limit(1);

    if (!authReq) {
      res.status(404).json({ error: "Authorization request not found or expired" });
      return;
    }

    if (new Date() > authReq.expiresAt) {
      await db.delete(schema.oauthAuthRequests).where(eq(schema.oauthAuthRequests.id, authReqId));
      res.status(410).json({ error: "Authorization request expired" });
      return;
    }

    const userId = await resolveUserId(req);
    const code = randomBytes(32).toString("hex");
    const now = new Date();

    await db.insert(schema.oauthAuthorizationCodes).values({
      code,
      clientId: authReq.clientId,
      userId,
      redirectUri: authReq.redirectUri,
      codeChallenge: authReq.codeChallenge,
      scopes: authReq.scopes,
      resource: authReq.resource,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    });

    await db.delete(schema.oauthAuthRequests).where(eq(schema.oauthAuthRequests.id, authReqId));

    const redirectUrl = new URL(authReq.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (authReq.state) redirectUrl.searchParams.set("state", authReq.state);

    res.json({ redirect: redirectUrl.toString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Authorization failed: ${msg}` });
  }
});

// ── REST API (requires Clerk session) ───────────────────────────

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

// ── MCP over StreamableHTTP (requires OAuth Bearer token) ───────

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  userId: string;
}
const sessions = new Map<string, SessionEntry>();

function createMcpServerForUser(userId: string): McpServer {
  const server = new McpServer({ name: "neuralpulse", version: "2.0.0" });
  registerTools(server, feedService, syncStateStore, () => userId);
  registerResources(server);
  return server;
}

const mcpBearerAuth = requireBearerAuth({
  verifier: oauthProvider,
  resourceMetadataUrl: `${serverUrl}/.well-known/oauth-protected-resource`,
});

app.post("/mcp", mcpBearerAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let entry: SessionEntry | undefined;

  if (sessionId && sessions.has(sessionId)) {
    entry = sessions.get(sessionId)!;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    const userId = req.auth!.extra!.userId as string;
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
  } else {
    res.status(400).json({ error: "Invalid or missing session" });
    return;
  }

  await entry.transport.handleRequest(req, res, req.body);
});

app.get("/mcp", mcpBearerAuth, async (req: Request, res: Response) => {
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

syncCoordinator.startBackgroundSync();

const httpServer = app.listen(PORT, () => {
  console.log(`NeuralPulse server running on ${serverUrl}`);
  console.log(`  MCP endpoint: ${serverUrl}/mcp`);
  console.log(`  OAuth metadata: ${serverUrl}/.well-known/oauth-authorization-server`);
  console.log(`  API endpoint: ${serverUrl}/api`);
  console.log(`  Health check: ${serverUrl}/health`);
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
