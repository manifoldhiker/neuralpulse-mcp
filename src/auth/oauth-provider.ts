import { randomBytes } from "node:crypto";
import type { Response } from "express";
import { eq, and, isNull } from "drizzle-orm";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { PgOAuthClientsStore } from "./oauth-clients-store.js";
import { getDb, schema } from "../db/index.js";

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export class NeuralPulseOAuthProvider implements OAuthServerProvider {
  private _clientsStore = new PgOAuthClientsStore();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const db = getDb();
    const now = new Date();

    const [row] = await db
      .insert(schema.oauthAuthRequests)
      .values({
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        state: params.state ?? null,
        codeChallenge: params.codeChallenge,
        scopes: params.scopes ?? [],
        resource: params.resource?.toString() ?? null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + AUTH_REQUEST_TTL_MS),
      })
      .returning({ id: schema.oauthAuthRequests.id });

    res.redirect(`/oauth/login?auth_req=${row.id}`);
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const db = getDb();
    const [row] = await db
      .select({ codeChallenge: schema.oauthAuthorizationCodes.codeChallenge })
      .from(schema.oauthAuthorizationCodes)
      .where(eq(schema.oauthAuthorizationCodes.code, authorizationCode))
      .limit(1);

    if (!row) throw new InvalidGrantError("Authorization code not found");
    return row.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const db = getDb();

    const [codeRow] = await db
      .select()
      .from(schema.oauthAuthorizationCodes)
      .where(eq(schema.oauthAuthorizationCodes.code, authorizationCode))
      .limit(1);

    if (!codeRow) throw new InvalidGrantError("Authorization code not found");
    if (codeRow.clientId !== client.client_id) throw new InvalidGrantError("Client mismatch");
    if (new Date() > codeRow.expiresAt) throw new InvalidGrantError("Authorization code expired");

    await db
      .delete(schema.oauthAuthorizationCodes)
      .where(eq(schema.oauthAuthorizationCodes.code, authorizationCode));

    const now = new Date();
    const accessToken = generateToken();
    const refreshToken = generateToken();

    await db.insert(schema.oauthTokens).values([
      {
        token: accessToken,
        type: "access",
        clientId: client.client_id,
        userId: codeRow.userId,
        scopes: codeRow.scopes,
        resource: codeRow.resource,
        createdAt: now,
        expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      },
      {
        token: refreshToken,
        type: "refresh",
        clientId: client.client_id,
        userId: codeRow.userId,
        scopes: codeRow.scopes,
        resource: codeRow.resource,
        createdAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    ]);

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: codeRow.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL,
  ): Promise<OAuthTokens> {
    const db = getDb();

    const [tokenRow] = await db
      .select()
      .from(schema.oauthTokens)
      .where(
        and(
          eq(schema.oauthTokens.token, refreshToken),
          eq(schema.oauthTokens.type, "refresh"),
          isNull(schema.oauthTokens.revokedAt),
        ),
      )
      .limit(1);

    if (!tokenRow) throw new InvalidGrantError("Refresh token not found");
    if (tokenRow.clientId !== client.client_id) throw new InvalidGrantError("Client mismatch");
    if (new Date() > tokenRow.expiresAt) throw new InvalidGrantError("Refresh token expired");

    await db
      .update(schema.oauthTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.oauthTokens.token, refreshToken));

    const now = new Date();
    const newAccessToken = generateToken();
    const newRefreshToken = generateToken();
    const effectiveScopes = scopes ?? tokenRow.scopes;

    await db.insert(schema.oauthTokens).values([
      {
        token: newAccessToken,
        type: "access",
        clientId: client.client_id,
        userId: tokenRow.userId,
        scopes: effectiveScopes,
        resource: tokenRow.resource,
        createdAt: now,
        expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      },
      {
        token: newRefreshToken,
        type: "refresh",
        clientId: client.client_id,
        userId: tokenRow.userId,
        scopes: effectiveScopes,
        resource: tokenRow.resource,
        createdAt: now,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    ]);

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: newRefreshToken,
      scope: effectiveScopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const db = getDb();

    const [tokenRow] = await db
      .select()
      .from(schema.oauthTokens)
      .where(
        and(
          eq(schema.oauthTokens.token, token),
          eq(schema.oauthTokens.type, "access"),
          isNull(schema.oauthTokens.revokedAt),
        ),
      )
      .limit(1);

    if (!tokenRow) throw new InvalidGrantError("Invalid access token");
    if (new Date() > tokenRow.expiresAt) throw new InvalidGrantError("Access token expired");

    return {
      token,
      clientId: tokenRow.clientId,
      scopes: tokenRow.scopes,
      expiresAt: Math.floor(tokenRow.expiresAt.getTime() / 1000),
      resource: tokenRow.resource ? new URL(tokenRow.resource) : undefined,
      extra: { userId: tokenRow.userId },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const db = getDb();
    await db
      .update(schema.oauthTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.oauthTokens.token, request.token));
  }
}
