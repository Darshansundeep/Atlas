//! Atlas auth client primitives. Spec 002-cloud-auth.
//!
//! This crate is the source of truth for client-side auth values that
//! both Rust callers (goose-server, future CLI) AND the TS desktop app
//! must agree on. The TS side reimplements the equivalents in
//! `ui/desktop/src/auth/` and the `identity-constants-in-sync` CI job
//! keeps them aligned (deferred T035).
//!
//! Today this crate exposes:
//!   - PKCE pair generation (S256, 128-char verifier)
//!   - Constants (issuer, audience, scopes, redirect URIs)
//!   - JWT claim shape (deserialization for consumers — verification is
//!     server-side at v1 per R-002-004)

pub mod pkce;
pub mod token;

pub const ISSUER: &str = "https://api.atlas.netgroup.ai";
pub const AUDIENCE: &str = "atlas-desktop";
pub const ATLAS_URL_SCHEME: &str = "atlas";
pub const REDIRECT_DEEPLINK: &str = "atlas://auth";

/// Keychain service identifier shared with the desktop. Mirrors
/// `ui/desktop/src/branding/index.ts::IDENTITY.bundleIdMacos`.
pub const KEYCHAIN_SERVICE: &str = "ai.netgroup.atlas";
pub const KEYCHAIN_ITEM_REFRESH: &str = "atlas-auth-refresh-token";
pub const KEYCHAIN_ITEM_DEVICE: &str = "atlas-device-install-id";
