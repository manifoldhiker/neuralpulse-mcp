# Authentication Report for Public NeuralPulse MCP

## Current state (orientation)

The current implementation is a local MCP server over stdio with one tool (`get_feed`) and no per-user identity.

Key implications:
- No account system (any client process can call the tool).
- No user-specific storage for feeds/preferences.
- No public deployment path (stdio is local-process transport).
- No token/session boundaries between end users and MCP clients.

This is perfect for local prototyping, but not sufficient for a public multi-user product.

## What is needed for public use

To make this usable by the general public, add these foundation layers:

1. **Public web app + API**
   - Host a web app where users sign up/sign in.
   - Host a backend API for account, subscription, and feed operations.

2. **Identity provider and account lifecycle**
   - Support Sign in with Google (OAuth 2.0 / OpenID Connect).
   - Support local accounts (email magic link or password) as backup to avoid Google-only lock-in.

3. **Session + token model**
   - Browser sessions for your web app (secure cookies).
   - API access tokens for MCP clients (OAuth access tokens with expiry and refresh support where needed).

4. **User data model**
   - Move from `feeds.json` to database tables keyed by `user_id`.
   - Persist subscriptions, read state, preferences, and optional saved items.

5. **MCP remote transport**
   - Expose MCP via network transport (HTTP/SSE or streamable HTTP, depending on client support).
   - Keep stdio for local dev; add remote MCP endpoint for public clients.

6. **Production security controls**
   - HTTPS everywhere, strict CORS policy, CSRF protection for cookie sessions, rate limiting, audit logs, secret management, and abuse controls.

## Recommended target architecture

Core components:
- **Frontend**: Web app (`app.neuralpulse...`) for onboarding and account management.
- **Backend API**: Handles auth, user data, feeds ingestion/retrieval, and MCP authorization logic.
- **MCP Gateway/Server**: Public MCP endpoint that validates bearer tokens and enforces per-user access.
- **Database**: Users, identities, sessions, OAuth grants/tokens, subscriptions, feed items metadata.
- **Queue/Worker** (optional but recommended): Background feed polling and normalization.

Auth boundaries:
- Browser <-> API: cookie session (HTTP-only, secure, same-site).
- MCP client <-> MCP endpoint: OAuth bearer token.
- MCP endpoint -> internal services: service-to-service credentials, never user cookies.

## Google account creation and sign-in flow

Implement Google auth as OIDC:

1. User clicks **Continue with Google** in web app.
2. Redirect to Google authorization endpoint with OIDC scopes (`openid email profile`) and PKCE.
3. Google redirects back to your callback URL with authorization code.
4. Backend exchanges code for tokens and verifies ID token claims (`iss`, `aud`, `exp`, nonce).
5. Backend creates or links a local user record and identity record:
   - `users` table entry.
   - `user_identities` row (`provider=google`, `provider_subject=sub`).
6. Backend creates an app session cookie and redirects user to dashboard.

Google Cloud setup required:
- Create a Google Cloud project.
- Configure OAuth consent screen (app name, support email, privacy policy, terms).
- Create OAuth client credentials (Web application).
- Add authorized redirect URIs for dev/prod (exact URLs).
- Store client ID/secret in secure secret manager.

Important: even with Google login, maintain your own internal `user_id` as the primary key. Do not use Google `sub` as your global app user key directly.

## MCP authentication through public web to app

Use OAuth between MCP clients and your MCP server, with your backend as Authorization Server.

High-level flow:
1. User connects NeuralPulse MCP in a client.
2. MCP client is redirected to your hosted auth page.
3. User signs in (or already has session via Google/local auth).
4. User grants consent (optional if first-party trust model is acceptable).
5. Client receives access token (and optionally refresh token).
6. Client calls MCP endpoint with `Authorization: Bearer <token>`.
7. MCP server validates token, resolves `user_id`, and executes tools with user-scoped data only.

Implementation details:
- Use Authorization Code + PKCE for public clients.
- Short-lived access tokens (for example 10-30 minutes).
- Rotate signing keys and expose JWKS if using JWT tokens.
- Prefer opaque tokens + introspection if you want central revocation/control.
- Include token scopes, e.g.:
  - `mcp:read_feed`
  - `mcp:write_subscriptions`
- Enforce scope checks per MCP tool.

Minimum endpoints/services to add:
- `/.well-known/openid-configuration` (if full OIDC)
- `/oauth/authorize`
- `/oauth/token`
- `/oauth/introspect` (if opaque tokens)
- `/oauth/revoke`
- `/mcp` (or `/mcp/sse`) for MCP transport

## Data model changes required

Suggested minimum tables:
- `users` (id, created_at, status)
- `user_identities` (user_id, provider, provider_subject, email, email_verified)
- `sessions` (session_id, user_id, expires_at, user_agent_hash, ip_hash)
- `oauth_clients` (client_id, redirect_uris, type)
- `oauth_authorization_codes`
- `oauth_access_tokens`
- `oauth_refresh_tokens`
- `subscriptions` (user_id, source_name, source_url, active)
- `feed_items` (normalized metadata; content fetched/cached policy-dependent)

## Security and compliance checklist

- TLS and HSTS in production.
- Secrets in managed vault; no secrets in repo.
- CSRF protection for browser POST actions.
- PKCE enforced for public clients.
- Strict redirect URI validation.
- Rate limiting on auth/token endpoints.
- Brute force and bot protection on login.
- Structured audit logging for sign-in/token issuance/revocation.
- User-facing account controls: logout all sessions, connected apps, revoke access.
- Privacy docs: Terms, Privacy Policy, Data Retention policy.

## Rollout plan (practical phases)

### Phase 1: Identity + app sessions
- Add Google OIDC login to web app.
- Add local user/session tables.
- Migrate feed subscriptions from file to per-user DB rows.
- Keep MCP local/stdio for now.

### Phase 2: Public MCP auth
- Expose remote MCP endpoint over HTTPS.
- Implement OAuth authorization server endpoints.
- Enforce bearer token validation + scope checks in MCP tool handlers.
- Add basic revocation and audit trails.

### Phase 3: Hardening + scale
- Add refresh token rotation, anomaly detection, abuse controls.
- Add worker-based feed ingestion and caching strategy.
- Add operational dashboards, error budgets, and incident runbooks.

## Build-vs-buy recommendation

Fastest safe path:
- Use a managed auth provider (Auth0, Clerk, WorkOS, Cognito, or equivalent) for Google login + sessions.
- Keep MCP token validation and scope authorization in your backend.

Reason:
- You reduce security implementation risk and time-to-market.
- You retain product control in your API and MCP authorization layer.

## Concrete next implementation steps in this repo

1. Add an `auth` module and user persistence layer (DB + migrations).
2. Replace `feeds.json` reads with `subscriptions` queries by `user_id`.
3. Add HTTP server mode alongside stdio mode.
4. Add bearer auth middleware and inject `user_id` into MCP tool context.
5. Add Google OIDC login endpoints and session management.
6. Add OAuth endpoints for MCP clients and scope checks in `get_feed` (and future tools).

---

This plan upgrades NeuralPulse from a local single-user MCP prototype to a secure, multi-user, internet-facing service with standards-based authentication.
