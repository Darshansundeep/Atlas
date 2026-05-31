# Contract: Desktop OS-Keychain Entries

**Feature**: `002-cloud-auth`
**Status**: authoritative
**Date**: 2026-05-31

Defines exactly what Atlas writes to the OS keychain, the naming scheme, the lifecycle, and the failure-mode handling. Backed by Electron's `safeStorage` API; works uniformly on macOS Keychain / Windows Credential Manager / Linux libsecret.

---

## Keychain entries

Atlas writes **exactly two** keychain entries per device-install:

| Entry | Service | Account | Value |
|---|---|---|---|
| 1. Refresh token | `ai.netgroup.atlas` | `atlas-auth-refresh-token` | `safeStorage.encryptString(refreshToken)` |
| 2. Device-install ID | `ai.netgroup.atlas` | `atlas-device-install-id` | UUID generated at first sign-in, persisted in cleartext (it's just an identifier, not a secret) |

**No other keychain entries** are written by the auth subsystem. (BYOK provider keys live in the existing Goose-managed keychain entries — out of scope of this contract.)

---

## Rules

- **R-KC-001**: Service name MUST be exactly `ai.netgroup.atlas` (matches `IDENTITY.bundleIdMacos`). On Windows this maps to `CredWrite TargetName = "ai.netgroup.atlas/atlas-auth-refresh-token"`. On Linux this maps to libsecret schema with attribute `service = ai.netgroup.atlas`.
- **R-KC-002**: Refresh-token VALUE MUST be passed through `safeStorage.encryptString()` BEFORE writing. The keychain entry contains ciphertext, not the plaintext token. Two-layer protection: keychain ACL + OS-bound encryption.
- **R-KC-003**: Atlas MUST NEVER persist the **access token** in the keychain. Access tokens live in memory only.
- **R-KC-004**: On every successful refresh (refresh-token rotation), Atlas MUST `safeStorage.encryptString(newRefreshToken)` and overwrite the keychain entry BEFORE acting on the new access token. If the keychain write fails, the new token MUST be discarded and the user prompted to re-sign-in (better to fail closed than to lose state).
- **R-KC-005**: On sign-out, Atlas MUST attempt to delete BOTH entries. If deletion fails (rare — usually OS permission issue), the access token is wiped from memory regardless, and a `keychain_delete_failed` audit event is emitted.
- **R-KC-006**: On `keychain_access_denied` (user revoked keychain access, MDM policy, etc.) — Atlas MUST show a clear in-app error explaining what the keychain is for and how to restore access. The app falls back to a "session-only" mode where the access token is held in memory and the user is re-prompted at next launch.
- **R-KC-007**: Atlas MUST NOT read keychain entries belonging to upstream Goose (`com.block.goose` service name or any variant). Constitution Principle I + spec `001-rebrand-pass` FR-013. The two products' keychains are strictly isolated.

---

## Lifecycle

```
First sign-in success:
  ├─ Generate UUID for device_install_id
  ├─ Write entry 2 (cleartext UUID)
  ├─ safeStorage.encryptString(refreshToken) → ciphertext
  ├─ Write entry 1 (ciphertext)
  └─ Return success to caller

Subsequent launch (silent refresh):
  ├─ Read entry 2 → device_install_id
  ├─ Read entry 1 → ciphertext
  ├─ safeStorage.decryptString(ciphertext) → refreshToken
  ├─ POST /v1/auth/token (refresh grant) with refreshToken + device_install_id
  ├─ If 200:
  │    ├─ safeStorage.encryptString(newRefreshToken)
  │    └─ Overwrite entry 1
  └─ If 401:
       ├─ Delete BOTH entries
       └─ Show Sign In screen

Sign-out:
  ├─ POST /v1/auth/revoke (best-effort)
  ├─ Delete entry 1 (always)
  ├─ Delete entry 2 (always)
  └─ Wipe in-memory access token

Sign-out + Erase Local Data (user-confirmed destructive):
  ├─ All of "Sign-out" above
  └─ Delete the Atlas-namespaced config directory (per spec 001 FR-003)
```

---

## Error matrix

| Error | Cause | Behaviour |
|---|---|---|
| `safeStorage.isEncryptionAvailable() === false` | Linux box without libsecret/gnome-keyring; rare | Fallback: in-memory session only, re-prompt every launch, surface a "your OS doesn't have a keychain — re-sign-in needed each launch" banner |
| Keychain write fails (permission) | User revoked Atlas's keychain access in System Settings | Show error UI per R-KC-006, link to keychain settings |
| Keychain entry exists but decryption fails | Likely a `safeStorage` key change after macOS major upgrade (rare); or DB-tier corruption | Delete the entry, treat as logged-out, re-prompt |
| Entry 1 exists but entry 2 missing (or vice versa) | Atlas was force-killed mid-write | Treat as logged-out, re-prompt; CI test covers this scenario |

---

## Verification

- `crates/atlas-auth-client/tests/keychain_roundtrip.rs` — write, read, decrypt, verify round-trip fidelity on each OS.
- `ui/desktop/src/auth/__tests__/keychain-bridge.test.ts` — Electron `safeStorage` is invoked with exactly the documented service + account names; never any other variant.
- Per-OS E2E in Playwright matrix (spec 001 Phase 7 reuses): install Atlas, sign in, force-quit, relaunch, verify silent refresh succeeds AND the keychain entry's plaintext is NOT recoverable from a keychain dump.
