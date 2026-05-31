# Contract: Token Shapes

**Feature**: `002-cloud-auth`
**Status**: authoritative
**Date**: 2026-05-31

Defines the exact wire format of access tokens and refresh tokens issued by `api.atlas.netgroup.ai`.

---

## Access Token (JWT)

**Algorithm**: HS256 at v1 (server verifies; desktop does not verify locally — calls `/v1/me` instead). Migrate to RS256 + JWKS at v1.5 when desktop self-verification becomes worthwhile (saves an RTT per UI render).

**Header**:
```json
{ "alg": "HS256", "typ": "JWT", "kid": "atlas-2026" }
```

**Payload (claims)**:
```json
{
  "iss": "https://api.atlas.netgroup.ai",
  "aud": "atlas-desktop",
  "sub": "<workos-user-id>",
  "email": "user@example.com",
  "name": "Display Name",
  "picture": "https://avatar.url/path.png",
  "sub_tier": "free" | "pro" | "team" | "enterprise",
  "iat": 1735689600,
  "exp": 1735690500,
  "device_install_id": "<uuid issued at first sign-in>"
}
```

**Rules**:
- **R-TOK-001**: TTL is 900 seconds (15 min). `exp - iat = 900` strictly.
- **R-TOK-002**: `iss` MUST be the literal string `"https://api.atlas.netgroup.ai"`. Mismatched issuer = reject.
- **R-TOK-003**: `aud` MUST be `"atlas-desktop"`. Mismatched audience = reject.
- **R-TOK-004**: `sub` MUST be a stable WorkOS user id. Atlas never invents user ids.
- **R-TOK-005**: `device_install_id` MUST match the refresh token used. Refresh-token-to-access-token binding is enforced — a refresh from device A cannot mint a token claiming device B.
- **R-TOK-006**: `sub_tier` snapshot is informational only — the desktop polls `/v1/subscription` every 5 min for the canonical state. Stale `sub_tier` in an access token does NOT grant access to features the user has since lost.
- **R-TOK-007**: Clock skew tolerance ±5 minutes when verifying `iat` / `exp` (per R-AUTH-009 in `auth-flow.md`).

---

## Refresh Token (opaque)

**Format**: a 256-bit random value, base64url-encoded (43 chars). NOT a JWT — opaque to the client.

**Examples**: `K7n2_qWxYz4hC8rD-mFt0bJv9Lp3RsUe1AcZeK0iOgY` (43 chars, URL-safe base64)

**Backend storage**: bcrypted (cost factor 12) before insertion into the `refresh_tokens` table. The plaintext token is only ever sent over TLS to the desktop and stored in the OS keychain.

**Rules**:
- **R-RT-001**: 30-day TTL, but **slides on every successful refresh**. A user who uses Atlas daily never sees a re-prompt; one who's away for >30 days is re-prompted.
- **R-RT-002**: Rotates on every use. The response to `/v1/auth/token` (refresh grant) always includes a NEW `refresh_token`. The previous one becomes invalid immediately after the new one is issued.
- **R-RT-003**: Bound to a `device_install_id`. Cannot be used from a different desktop install. Stolen-token resilience: if an attacker copies the token to a new device, the rotation-detection trips on the next legitimate use.
- **R-RT-004**: One-shot use only — server marks token rotated; a second attempt at the SAME token returns 401 AND revokes all tokens for that user (rotation theft response, per RFC 6749 §10.4).
- **R-RT-005**: Refresh tokens NEVER appear in logs, telemetry, audit events, or any backend table column other than `refresh_tokens.token_hash` (bcrypted).

---

## Token Lifecycle Diagram

```
Sign-in
   │
   ▼
[Issue access#1 (15min) + refresh#1 (30d)]
   │
   │ time passes; access#1 ~14min old
   ▼
Desktop hits /v1/auth/token with refresh#1
   │
   ▼
[Verify refresh#1 hash exists & not revoked]
   │
   ▼
[Mark refresh#1 rotated_to_id = refresh#2]
   │
   ▼
[Issue access#2 (15min) + refresh#2 (30d, fresh TTL)]
   │
   │ keep going...
   │
   ▼
Sign-out
   │
   ▼
[POST /v1/auth/revoke with current refresh]
   │
   ▼
[Mark all refresh tokens for this user as revoked_at=now]
   │
   ▼
[Desktop wipes keychain entry]
```

---

## Replay-Attack Detection

If the SAME refresh token is presented to `/v1/auth/token` TWICE (after the first successful rotation):

1. Server detects `refresh_tokens.rotated_to_id IS NOT NULL` AND request token matches the rotated one.
2. Server marks BOTH `refresh_tokens.id = rotated.id` AND `refresh_tokens.id = rotated.rotated_to_id` as revoked.
3. Server returns 401 to the requesting desktop.
4. Server emits a `revoked_token_detected` audit event.
5. The legitimate user gets re-prompted to sign in (their now-current refresh token is invalidated).

This is the standard token-theft response per RFC 6749. It's slightly user-hostile (the real user gets logged out), but it's the only way to neutralize a stolen token without out-of-band coordination.

---

## Verification

- Backend tests in `services/atlas-auth-api/src/tests/`:
  - `token-shapes.test.ts` — every JWT issuance produces a token matching this contract exactly.
  - `refresh-rotation.test.ts` — rotation semantics, replay detection.
- Desktop tests in `ui/desktop/src/auth/__tests__/`:
  - `jwt-claim-validation.test.ts` — desktop rejects tokens with wrong `iss`/`aud`/missing claims.
  - `refresh-rotation.test.ts` — desktop replaces stored refresh on every successful use.
