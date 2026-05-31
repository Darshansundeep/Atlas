# Research: Cloud Auth for Atlas Desktop

**Feature**: `002-cloud-auth`
**Plan**: [plan.md](./plan.md)
**Date**: 2026-05-31

Resolves the unknowns flagged in `plan.md`'s Technical Context. Each entry follows:

- **Decision**: what was chosen
- **Rationale**: why
- **Alternatives considered**: what else was on the table and why rejected

---

## R-002-001: WorkOS plan tier + SDK version pinning

**Decision**: Start on WorkOS's **free tier** (no signed contract required). Pin `@workos-inc/node` at `^7.x` for the backend; use AuthKit hosted at `https://api.workos.com/user_management/authorize` for the user-facing sign-in page. Atlas's WorkOS organization is created via the WorkOS dashboard; the client ID + (server-side) API key are stored as Cloudflare Worker secrets.

**Rationale**:
- WorkOS free tier supports up to ~1M MAU on AuthKit + SSO connections — Atlas's v1 trajectory stays under this for years.
- Cursor uses the same setup (publicly documented WorkOS customer); a known-good path.
- Pinning the SDK major version locks the API contract while letting us pick up minor security fixes.

**Alternatives considered**:
- WorkOS Enterprise / Pro tier — only worth it once we cross paid-feature thresholds (SCIM at high org count, Audit Logs API beyond free quota). Defer.
- Embedding WorkOS Widgets (drop-in JS) inside the desktop — rejected because it'd mean an in-app webview for auth, which violates RFC 8252 and the spec (FR-002, no in-app webview).

**Verification**: signup at workos.com, create one Atlas org, capture `WORKOS_CLIENT_ID` + `WORKOS_API_KEY` in `services/atlas-auth-api/.dev.vars` template.

---

## R-002-002: PKCE implementation

**Decision**: Implement PKCE inline (no library) using `S256` method:
- `code_verifier` = 128 chars from `[A-Za-z0-9_-]` (≈ 768 bits of entropy)
- `code_challenge` = `base64url(sha256(code_verifier)).replace(/=+$/, '')`
- `state` = 32 random bytes → `base64url`

Both the Rust (`crates/atlas-auth-client/src/lib.rs`) and TypeScript (`ui/desktop/src/auth/index.ts`) sides use the same algorithm.

**Rationale**:
- ~40 lines of code per language — no dependency surface.
- Matches RFC 7636 exactly; any conformant OAuth server (WorkOS included) accepts it.
- Avoiding a library here eliminates a vector for supply-chain attack on the most security-sensitive code path.

**Alternatives considered**:
- `oauth4webapi` (TypeScript) — adds a 50 kB dependency for code we can inline in 40 lines.
- `oauth2-rs` crate — same trade-off; the Atlas client uses only PKCE, not the broader OAuth lifecycle.

**Verification**: unit tests in both modules generate fixed-seed verifier/challenge pairs and assert the WorkOS reference values match.

---

## R-002-003: OS keychain API surface

**Decision**: Use Electron's `safeStorage` API exclusively. It abstracts:
- macOS — Keychain Services (`SecItemAdd` / `SecItemCopyMatching`)
- Windows — Credential Manager via `CredWrite` / `CredRead`
- Linux — libsecret via Secret Service D-Bus API

Atlas writes a single keychain entry per device-install:
- Key (service): `ai.netgroup.atlas`
- Account: `atlas-auth-refresh-token`
- Value: encrypted refresh-token blob

`safeStorage.encryptString()` is called BEFORE the keychain write so even a keychain dump shows only ciphertext.

**Rationale**:
- `safeStorage` ships with Electron; zero new dependencies, audited code.
- Abstracts the OS differences uniformly — Constitution Principle IV (cross-platform parity) satisfied for free.
- Two layers of protection: keychain ACL (only Atlas process reads) + safeStorage encryption (even if dumped, blob is unreadable without the OS keychain key).

**Alternatives considered**:
- `keytar` npm package — abandonned by GitHub; native module headaches across the 3 OSes; rejected.
- Custom native bindings per OS — high engineering cost, no advantage over `safeStorage`.

**Verification**: keychain-roundtrip integration test on each OS in CI matrix.

---

## R-002-004: JWT signing key management

**Decision**: Use **Cloudflare Workers KV bound to an HMAC key** for v1 (HS256 JWT). Migrate to **Cloudflare D1 + AWS KMS for RS256** at the first sign of needing key rotation that survives deploys.

For v1:
- Backend generates one HS256 secret at first deploy, stored in Worker secret variable `JWT_SIGNING_SECRET`.
- The same secret is used to sign + verify (backend-only — desktop verifies via JWKS endpoint at `api.atlas.netgroup.ai/.well-known/jwks.json` which exposes the HS256-equivalent-as-RS256 public material — actually for HS256 we expose only the algorithm header and use server-side verification on the desktop's behalf via `/v1/me`).
- Actually simpler v1: skip self-verifying on desktop. Desktop POSTS access token to `/v1/me`; backend verifies and returns user info. Stateless desktop, slightly chattier — acceptable at v1 scale.

**Rationale**:
- HS256 lets us ship without KMS infrastructure for the v1 cohort.
- Moving to RS256 + JWKS is a transparent backend-side change later; the desktop never breaks because it's not verifying locally at v1.
- Cloudflare Workers KV is already in the stack; no new infra.

**Alternatives considered**:
- RS256 + KMS from day one — extra infra (AWS KMS or Cloudflare Workers' new key API), nice-to-have for "desktop verifies locally" but the perf cost of `/v1/me` is small at <100K MAU.
- Self-hosted signing key in a Hashicorp Vault — overkill for v1.

**Verification**: rotation drill at v1.5 — generate new HS256 secret, deploy with dual-verify (old + new), revoke old after 24h grace.

---

## R-002-005: Refresh-token storage in Postgres

**Decision**: Store refresh tokens as `bcrypt(token)` hashed values, NOT plaintext. Plaintext token is only ever in transit (over TLS) and in the desktop's OS keychain. Database column type: `bytea`. Each refresh token has:
- `id` UUID (the only identifier returned to client)
- `token_hash` bcrypt of the random opaque token
- `user_id` FK
- `device_install_id` (returned in first sign-in, sent with every refresh)
- `created_at`, `expires_at`, `revoked_at`
- `rotated_to_id` self-FK pointing at the successor token (for replay-attack detection)

On refresh: client sends the token, server looks up by id, bcrypt-verifies, issues a new token, marks the old as `rotated_to_id = new.id`. If the SAME old token is presented after rotation, server detects the rotation and revokes BOTH the new and old (token-rotation theft detection).

**Rationale**:
- Database compromise doesn't leak tokens — only hashes.
- Token-rotation theft detection (per RFC 6749 §10.4) is essential for refresh tokens stored on user devices.
- bcrypt cost factor 12 keeps `/refresh` latency under 100ms p95.

**Alternatives considered**:
- Plaintext storage — rejected on principle.
- Row-level encryption with pgcrypto — added complexity for no benefit over application-layer bcrypt.

**Verification**: tests in `services/atlas-auth-api/src/tests/refresh-rotation.test.ts` and a replay-detection scenario test.

---

## R-002-006: Cert pinning strategy

**Decision**: Pin to the **leaf certificate's SubjectPublicKeyInfo (SPKI) hash**, with a 2-cert window (active + backup) hard-coded into `crates/atlas-auth-client/src/pins.rs`. Rotation procedure:
1. Generate the next-cycle cert + record its SPKI hash 90 days before active expiry.
2. Add the new hash as a SECOND pinned value in the Rust source.
3. Ship a desktop release with BOTH pins.
4. Wait 30 days for end-user adoption (auto-update from spec 009).
5. Cut over: old cert stays active for another 30 days while new cert serves; desktops accept either.
6. Retire old pin in the next desktop release.

**Rationale**:
- Leaf SPKI pin is more security-strict than CA-pin; an attacker compromising the CA cannot impersonate Atlas.
- 2-cert window prevents the classic "I rotated the cert and bricked every desktop" mistake.
- 90-day window aligns with Let's Encrypt's 90-day cert lifetime, the most common CA we'd use behind Cloudflare.

**Alternatives considered**:
- Pin to root CA (DigiCert, ISRG, etc.) — simpler but allows any cert from that CA to impersonate Atlas; rejected on threat-model grounds.
- No pinning — relies entirely on the OS trust store; accepts the threat of a state-level CA compromise. Atlas's user data is sensitive enough to warrant pinning.

**Verification**: a synthetic "pinned cert is wrong" test in CI; production rotation drill twice a year (per release-engineering spec 009).

---

## R-002-007: Localhost loopback port selection

**Decision**: At sign-in start, the desktop:
1. Binds an HTTP server on `127.0.0.1:<random-port>` (ephemeral 49152-65535 range; OS-assigned).
2. Includes the listener's actual port in the OAuth `redirect_uri` parameter sent to WorkOS — e.g., `redirect_uri=http://127.0.0.1:53412/callback`.
3. WorkOS allows the loopback URL pattern with wildcard ports if configured (WorkOS supports this per their docs).
4. Listener accepts ONLY one request, only from localhost, then shuts down. Idle timeout 10 minutes; after that the listener stops and sign-in needs to be retried.

The `atlas://` deep-link is sent in PARALLEL — first one to deliver the code wins. The other path is invalidated via the `state` value being one-shot.

**Rationale**:
- Loopback works in 99% of network environments because firewalls allow localhost traffic.
- Deep link is faster when it works (no localhost server overhead); loopback is the safety net.
- Both share the same `state` so only one can succeed.

**Alternatives considered**:
- Loopback only — gives up the smoother deep-link UX when network allows it.
- Deep link only — fails on locked-down networks where atlas:// isn't allowed.
- Fixed port (e.g., 9000) — collisions with other dev tools; security-conscious antivirus flags fixed-port listeners.

**Verification**: integration test that simulates atlas:// being blocked and asserts loopback completes sign-in successfully.

---

## R-002-008: Deep-link singleton pattern in Electron

**Decision**: Atlas uses Electron's `app.requestSingleInstanceLock()` to ensure only one Atlas process is running. When a SECOND atlas:// invocation arrives (e.g., user clicks a sign-in link from a different browser tab while Atlas is already running):
1. The second Electron process exits immediately after notifying the primary via `second-instance` event.
2. The primary process receives the URL via the event's `commandLine` argument.
3. Primary checks the URL's `state` against the current `SignInAttempt` map (in-memory).
4. If state matches an active attempt — route to that window's auth handler.
5. If state doesn't match — log a rejection (per FR-014) and discard.

**Rationale**:
- Standard Electron pattern; copy-paste from VS Code, Cursor, Discord, etc.
- Window-disambiguation (which Atlas window initiated this sign-in?) handled by storing the `BrowserWindow.id` in the `SignInAttempt` map.

**Alternatives considered**:
- Multi-instance Atlas — would break the single-keychain-entry assumption (each Atlas instance would race for the keychain); rejected.

**Verification**: integration test that launches two Atlas processes and asserts the second one routes the URL and exits.

---

## Open items (not blocking Phase 1)

- **Email provider for password-reset / verification emails**: WorkOS handles this internally for AuthKit; no separate decision needed.
- **MFA enforcement policy**: WorkOS supports TOTP + WebAuthn + email codes. Recommend OPTIONAL at v1, REQUIRED for Pro+ tiers (spec `024-skill-pricing` decision).
- **Session-revocation broadcast**: a user signs out on one device — does that revoke the OTHER device's tokens? Yes by default (revoke-all-refresh-tokens-for-user). Per-device sign-out is a v2 feature.
- **Compliance**: SOC 2 prep work — WorkOS is already SOC 2 Type II, transitively covering us for auth.

These items are recorded for future-spec attention; they do not block 002 implementation.
