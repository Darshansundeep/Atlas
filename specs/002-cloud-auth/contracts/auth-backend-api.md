# Contract: Atlas Auth Backend API

**Service**: `api.atlas.netgroup.ai`
**Feature**: `002-cloud-auth`
**Status**: authoritative
**Date**: 2026-05-31

Defines the HTTP API surface for the cloud auth backend. Built on Hono + Cloudflare Workers; Postgres for persistent state.

---

## Endpoints

### `POST /v1/auth/token`

Exchange an OAuth code OR a refresh token for an access+refresh pair.

**Request — authorization-code grant**:
```http
POST /v1/auth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "<opaque-code-from-workos-redirect>",
  "code_verifier": "<128-char-pkce-verifier>",
  "redirect_uri": "atlas://auth"  (or "http://127.0.0.1:53412/callback" for loopback)
}
```

**Request — refresh-token grant**:
```http
POST /v1/auth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "refresh_token": "<43-char-opaque>"
}
```

**Response** (both paths, 200 OK):
```json
{
  "access_token": "<jwt>",
  "refresh_token": "<new-opaque-43-char>",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "<uuid>",
    "email": "user@example.com",
    "name": "Display Name",
    "picture": "https://...",
    "sub_tier": "free"
  },
  "device_install_id": "<uuid>"
}
```

**Error responses**:
- `400` — invalid grant type / missing fields
- `401` — code expired, code already exchanged, refresh token unknown or revoked
- `403` — rotation theft detected (see R-RT-004) — also revokes all user tokens
- `429` — rate-limited (>10 attempts/min per IP)
- `500` — WorkOS upstream failure (retry with exponential backoff)

**Rate limits**: 10 req/min/IP for code grant, 60 req/min/user for refresh grant.

---

### `POST /v1/auth/revoke`

Revoke the presented refresh token AND all sibling tokens for the same user.

**Request**:
```http
POST /v1/auth/revoke
Content-Type: application/json

{ "refresh_token": "<opaque>" }
```

**Response**: `204 No Content` on success. Idempotent — revoking an already-revoked token also returns `204`.

**Behaviour**:
- Marks `refresh_tokens.revoked_at = NOW()` for the presented token.
- Marks all other refresh tokens for the same `user_id` as revoked (server-side global sign-out).
- Emits `sign_out` audit event.

---

### `GET /v1/me`

Returns the current user's profile + tier. Used by desktop in lieu of self-verifying the JWT at v1.

**Request**:
```http
GET /v1/me
Authorization: Bearer <access-token>
```

**Response** (200):
```json
{
  "id": "<uuid>",
  "email": "user@example.com",
  "name": "Display Name",
  "picture": "https://...",
  "sub_tier": "free",
  "entitlements": ["atlas_cloud_proxy", "skill_marketplace"],
  "device_install_id": "<uuid>"
}
```

**Error**: `401` if token expired / invalid signature / wrong issuer or audience.

---

### `GET /v1/subscription`

Returns the user's subscription tier and quota. Polled by desktop every 5 min.

**Request**:
```http
GET /v1/subscription
Authorization: Bearer <access-token>
```

**Response** (200):
```json
{
  "tier": "pro",
  "monthly_token_quota": 5000000,
  "monthly_tokens_used": 1234567,
  "renews_at": 1738291200000,
  "entitlements": ["atlas_cloud_proxy", "skill_marketplace", "priority_support"]
}
```

**Cache hint**: response includes `Cache-Control: private, max-age=240` (4 min) so the desktop's 5-min poll cadence aligns with revalidation.

---

### `GET /.well-known/jwks.json`

Publishes the JWT verification key (v1.5+, when RS256 is adopted). At v1 with HS256, this endpoint returns `404` and the desktop is documented to NOT attempt local JWT verification — it uses `/v1/me` instead.

---

### `POST /v1/auth/workos-webhook`

Internal — receives WorkOS lifecycle events (user.updated, user.deleted, organization.membership.changed). NOT called by the desktop. Authenticated via WorkOS webhook signing key (`WORKOS_WEBHOOK_SECRET`).

---

## Rules

- **R-API-001**: All endpoints REQUIRE TLS 1.3+. HTTP→HTTPS redirect via Cloudflare; no plaintext.
- **R-API-002**: All responses include `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
- **R-API-003**: CORS: only `https://auth.atlas.netgroup.ai` and the Atlas desktop's loopback origin (`http://127.0.0.1:*`) are permitted. No wildcard.
- **R-API-004**: Tokens MUST NOT be logged at INFO+ level. The token-leak-scanner test runs in CI on every deploy.
- **R-API-005**: Every response includes a `X-Atlas-Request-Id` header for support correlation. Stored server-side for 7 days, never with token contents.
- **R-API-006**: `503` returned with `Retry-After` header if the backend is in maintenance mode. Desktop respects this and waits.

---

## Database schema (Postgres)

```sql
CREATE TABLE users (
  id           UUID PRIMARY KEY,           -- WorkOS user id, mirrored locally
  email        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id                  UUID PRIMARY KEY,
  token_hash          BYTEA NOT NULL,                -- bcrypt(token)
  user_id             UUID NOT NULL REFERENCES users(id),
  device_install_id   UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,
  rotated_to_id       UUID REFERENCES refresh_tokens(id)
);
CREATE INDEX ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX ON refresh_tokens(expires_at);

CREATE TABLE audit_events (
  id          UUID PRIMARY KEY,
  user_id     UUID REFERENCES users(id),
  event_type  TEXT NOT NULL,
  error_code  TEXT,
  device_os   TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON audit_events(user_id, occurred_at DESC);

CREATE TABLE subscription_state (
  user_id              UUID PRIMARY KEY REFERENCES users(id),
  tier                 TEXT NOT NULL DEFAULT 'free',
  monthly_token_quota  INTEGER,
  monthly_tokens_used  INTEGER NOT NULL DEFAULT 0,
  renews_at            TIMESTAMPTZ,
  entitlements         JSONB NOT NULL DEFAULT '[]',
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Verification

- `services/atlas-auth-api/src/tests/`:
  - `token-grant.test.ts` — authorization-code + refresh-token paths
  - `revoke.test.ts` — single + cascade revoke
  - `me-and-subscription.test.ts` — authenticated profile + tier
  - `replay-detection.test.ts` — refresh-rotation theft response
  - `token-leak-scan.test.ts` — scan logs/responses for token-shaped strings
- Cloudflare Workers integration test on every PR (worker boots, hits each endpoint with a stub WorkOS).
