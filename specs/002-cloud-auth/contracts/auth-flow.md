# Contract: Atlas Cloud Auth Flow

**Feature**: `002-cloud-auth`
**Status**: authoritative

This contract defines the wire-level handshake between the Atlas desktop client, the user's system browser, and the cloud auth backend at `auth.atlas.netgroup.ai` / `api.atlas.netgroup.ai`.

## Sequence — first-time sign-in (User Story 1)

```
┌──────────────┐                ┌─────────────┐                 ┌──────────────────────┐
│ Atlas Desktop│                │ Sys Browser │                 │ auth.atlas.netgroup  │
└──────┬───────┘                └──────┬──────┘                 └───────────┬──────────┘
       │  User clicks Sign In           │                                   │
       │ ─────► generates state (128b)  │                                   │
       │        + PKCE code_verifier    │                                   │
       │        + code_challenge        │                                   │
       │                                │                                   │
       │ shell.openExternal(            │                                   │
       │   "https://auth.atlas..../     │                                   │
       │    signin?client_id=atlas-desk │                                   │
       │    &redirect_uri=atlas://auth  │                                   │
       │    &response_type=code         │                                   │
       │    &code_challenge=...         │                                   │
       │    &code_challenge_method=S256 │                                   │
       │    &state=...                  │                                   │
       │    &scope=openid+profile+      │                                   │
       │           email+sub"           │                                   │
       │ ──────────────────────────────►│                                   │
       │                                │ ─── GET /signin?... ──────────────►│
       │                                │                                   │
       │                                │       (user signs in)             │
       │                                │ ◄── 302 Location:                 │
       │                                │       atlas://auth?code=<opaque>  │
       │                                │       &state=<csrf>               │
       │                                │                                   │
       │  OS routes atlas:// URL to     │                                   │
       │  the running Atlas instance    │                                   │
       │ ◄──────────────────────────────│                                   │
       │                                │                                   │
       │  validates state matches       │                                   │
       │  POST api.atlas.../v1/auth/    │                                   │
       │    token                       │                                   │
       │    {                           │                                   │
       │      grant_type: "authoriza-   │                                   │
       │        tion_code",             │                                   │
       │      code: <opaque>,           │                                   │
       │      code_verifier: <pkce>,    │                                   │
       │      client_id: "atlas-desk"   │                                   │
       │    }                           │                                   │
       │ ──────────────────────────────────────────────────────────────────►│
       │                                                                    │
       │ ◄── 200 OK { access_token, refresh_token, expires_in, user, sub } ─│
       │                                                                    │
       │  stores tokens in OS keychain                                      │
       │  unlocks main UI                                                   │
```

## Endpoints (server-side)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET`  | `auth.atlas.netgroup.ai/signin` | Render login UI; consumes `client_id`, `redirect_uri`, `state`, `code_challenge`, `code_challenge_method`, `scope`. On submit, redirects back to `redirect_uri` with `code` + `state`. | none |
| `POST` | `api.atlas.netgroup.ai/v1/auth/token` | Exchange `code` (or `refresh_token`) for `{access_token, refresh_token, expires_in, token_type:"Bearer", user, sub}`. | none for `code` grant; refresh-token presented in body for refresh grant |
| `POST` | `api.atlas.netgroup.ai/v1/auth/revoke` | Revoke the bearer refresh token. Returns `204` on success. Idempotent — revoking an unknown token returns `204`. | refresh_token in body |
| `GET`  | `api.atlas.netgroup.ai/v1/me` | Return claims for the current access token (id, email, display name, avatar URL, subscription tier, entitlements). | Bearer access_token |
| `GET`  | `api.atlas.netgroup.ai/v1/subscription` | Return current subscription state + entitlements. Cached client-side for ≤ 5 min. | Bearer access_token |

## Token shapes

**Access token**: JWT signed by KMS-managed key, RS256 or ES256, JWKS published at `api.atlas.netgroup.ai/.well-known/jwks.json`. Claims include `sub`, `email`, `name`, `picture`, `sub_tier` (one of `free` / `pro` / `team` / `enterprise`), `exp`, `iat`. TTL: 15 minutes.

**Refresh token**: opaque (not parseable client-side), bound to a single device-install via a `client_install_id` claim issued at first sign-in. Rotates on every successful use; the prior token is invalidated. TTL: 30 days (slide on use).

## Rules

- **R-AUTH-001**: The desktop MUST NOT embed a client secret. Authentication is via OAuth 2.0 with PKCE (`code_challenge_method=S256`).
- **R-AUTH-002**: The desktop MUST use `shell.openExternal` (Electron) to open the system browser. In-app `BrowserView` or `webview` for auth is forbidden (RFC 8252, Google OAuth policy).
- **R-AUTH-003**: The `state` value MUST be cryptographically random (≥128 bits) and validated against the active sign-in attempt. Mismatched state MUST be rejected and logged.
- **R-AUTH-004**: PKCE `code_verifier` MUST be random (≥256 bits encoded), held in memory only, and discarded after use.
- **R-AUTH-005**: Tokens MUST be stored exclusively in the OS-native secure store. Plaintext file storage anywhere in the Atlas namespace is forbidden.
- **R-AUTH-006**: Refresh tokens MUST be rotated: every refresh issues a new refresh token and invalidates the prior one. The desktop MUST update its stored refresh-token on every successful refresh.
- **R-AUTH-007**: The desktop MUST NOT include tokens, codes, or `state` parameters in telemetry payloads, crash reports, audit-log entries shipped off-device, or any log file (level INFO or above).
- **R-AUTH-008**: Sign-out MUST attempt to revoke the refresh token AND delete local credentials. Local deletion MUST proceed even if revoke fails (offline / server outage).
- **R-AUTH-009**: Atlas MUST validate every JWT it receives: signature (against JWKS), `iss`, `aud`, `exp`, `iat`. Clock skew tolerance: ±5 minutes.
- **R-AUTH-010**: Atlas MUST refuse to operate against an `auth.` or `api.` host without TLS 1.3+ and a certificate-pin chain matching the pin set in `crates/atlas-auth-client/src/pins.rs` (added in implementation).

## Verification

- Integration test `auth_flow_first_signin_test`: spawn a stub auth server, run the full handshake, assert tokens land in keychain and main UI unlocks.
- Integration test `auth_state_mismatch_rejected_test`: feed a deep link with a wrong `state`; assert rejection + audit-log entry.
- Integration test `token_refresh_rotates_refresh_token_test`: refresh once, assert old refresh token is now rejected.
- Security test `tokens_not_in_logs_test`: scan all log files after a full sign-in + use cycle for any token-shaped string.
- Cross-OS test (3 OSes): the full first-signin + relaunch + sign-out cycle.
