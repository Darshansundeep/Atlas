//! Atlas identity constants — Rust source of truth.
//!
//! Mirrors `ui/desktop/src/branding/index.ts`. Both files MUST stay in lockstep;
//! the `identity-constants-in-sync` CI job enforces it.
//!
//! Contract: `specs/001-rebrand-pass/contracts/identity-constants.md`.
//!
//! No literal "Atlas" string MAY appear elsewhere in `crates/`. The lint
//! `forbid-literal-product-names` enforces this.

/// Product display name shown to end users.
pub const DISPLAY_NAME: &str = "Atlas";

/// Lowercase product slug — used in binary name, config paths, package names.
pub const PRODUCT_SLUG: &str = "atlas";

/// Vendor name shown in About / installer publisher fields.
pub const VENDOR: &str = "NET Group";

/// Vendor domain — used in update / telemetry endpoint construction.
pub const VENDOR_DOMAIN: &str = "netgroup.ai";

/// macOS bundle identifier (reverse-DNS).
pub const BUNDLE_ID_MACOS: &str = "ai.netgroup.atlas";

/// Windows AppUserModelID (publisher.product).
pub const APP_USER_MODEL_ID_WINDOWS: &str = "NETGroup.Atlas";

/// Linux desktop entry name.
pub const DESKTOP_ENTRY_LINUX: &str = "atlas";

/// Custom URL scheme registered to the application.
pub const URL_SCHEME: &str = "atlas";

/// Environment variable prefix; legacy `GOOSE_` MUST NOT be read.
pub const ENV_VAR_PREFIX: &str = "ATLAS_";

/// User-Agent template; substitute `{version}` and `{os}` at call site.
pub const USER_AGENT_TEMPLATE: &str = "Atlas/{version} ({os}; NET Group)";

/// Upstream project name — for About-screen attribution ONLY.
/// Per contract R-IC-004, no other Rust call site may reference this constant.
pub const UPSTREAM_PROJECT_NAME: &str = "Goose";

/// Upstream project URL — for About-screen attribution ONLY.
pub const UPSTREAM_PROJECT_URL: &str = "https://github.com/block/goose";

/// Upstream pinned version — kept in sync with `UPSTREAM_VERSION` at repo root.
pub const UPSTREAM_PINNED_VERSION: &str = "v1.36.0";

/// Build a User-Agent string by substituting into the template.
pub fn user_agent(version: &str, os: &str) -> String {
    USER_AGENT_TEMPLATE
        .replace("{version}", version)
        .replace("{os}", os)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_agent_substitutes() {
        let ua = user_agent("0.1.0", "darwin");
        assert_eq!(ua, "Atlas/0.1.0 (darwin; NET Group)");
    }

    #[test]
    fn identity_constants_are_nonempty() {
        assert!(!DISPLAY_NAME.is_empty());
        assert!(!PRODUCT_SLUG.is_empty());
        assert!(!VENDOR.is_empty());
        assert!(!BUNDLE_ID_MACOS.is_empty());
        assert!(!URL_SCHEME.is_empty());
        assert!(ENV_VAR_PREFIX.ends_with('_'));
    }

    #[test]
    fn bundle_id_is_reverse_dns() {
        // From contract validation rules in data-model.md
        let parts: Vec<&str> = BUNDLE_ID_MACOS.split('.').collect();
        assert!(parts.len() >= 3, "bundle id must have >=3 reverse-DNS components");
        for p in parts {
            assert!(!p.is_empty(), "no empty component allowed");
        }
    }
}
