import { randomUUID, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getDb, schema } from "../db/index.js";

export class PgOAuthClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(schema.oauthClients)
      .where(eq(schema.oauthClients.clientId, clientId))
      .limit(1);

    if (!row) return undefined;

    return {
      ...(row.metadata as Record<string, unknown>),
      client_id: row.clientId,
      client_secret: row.clientSecret ?? undefined,
      client_secret_expires_at: row.clientSecretExpiresAt ?? undefined,
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      redirect_uris: row.redirectUris,
      client_name: row.clientName ?? undefined,
    } as OAuthClientInformationFull;
  }

  async registerClient(
    clientMetadata: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): Promise<OAuthClientInformationFull> {
    const db = getDb();
    const clientId = randomUUID();
    const clientSecret = randomBytes(32).toString("hex");
    const now = new Date();

    const { redirect_uris, client_name, client_secret, client_secret_expires_at, ...rest } =
      clientMetadata as Record<string, unknown>;

    await db.insert(schema.oauthClients).values({
      clientId,
      clientSecret,
      clientSecretExpiresAt: null,
      redirectUris: redirect_uris as string[],
      clientName: (client_name as string) ?? null,
      metadata: rest,
      createdAt: now,
    });

    return {
      ...clientMetadata,
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
    } as OAuthClientInformationFull;
  }
}
