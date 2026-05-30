//! Negative-isolation test: Atlas MUST NOT read pre-existing upstream Goose state.
//!
//! Task: T024b.
//! Spec:  FR-013 — "Atlas MUST NOT automatically migrate, copy, or read state
//!        from any pre-existing upstream Goose installation."
//!
//! Strategy: this test exercises path-derivation only (it is a pure-function
//! test). A heavier integration test that actually boots Atlas and observes
//! filesystem opens is out of scope of this crate; T024b's true verification
//! belongs in a UI/e2e suite once the desktop app uses these constants.
//!
//! Today this test asserts what we CAN check at the branding-crate layer:
//!   1. `ENV_VAR_PREFIX` is `ATLAS_`, not `GOOSE_`.
//!   2. `PRODUCT_SLUG` is `atlas`, not `goose` — config-dir helpers built on
//!      this constant therefore route to atlas/ directories.
//!   3. The branding crate exposes no helper that returns a `goose/` path,
//!      `goose:` scheme, or `GOOSE_` prefix — searched via #[cfg(test)] sanity.

use atlas_branding::*;

#[test]
fn env_prefix_is_atlas_not_goose() {
    assert_eq!(ENV_VAR_PREFIX, "ATLAS_");
    assert!(!ENV_VAR_PREFIX.to_lowercase().contains("goose"));
}

#[test]
fn product_slug_is_atlas_not_goose() {
    assert_eq!(PRODUCT_SLUG, "atlas");
    assert!(!PRODUCT_SLUG.to_lowercase().contains("goose"));
}

#[test]
fn url_scheme_is_atlas_not_goose() {
    assert_eq!(URL_SCHEME, "atlas");
    assert!(!URL_SCHEME.to_lowercase().contains("goose"));
}

#[test]
fn user_agent_template_identifies_atlas() {
    let ua = user_agent("0.1.0", "darwin");
    assert!(ua.starts_with("Atlas/"), "User-Agent must identify the client as Atlas: {ua}");
    assert!(!ua.to_lowercase().contains("goose"));
}

// Sentinel: these are the only constants where the literal upstream name is
// permitted (attribution surface per R-IC-004). Test guards against accidental
// reuse of these strings outside attribution code paths.
#[test]
fn upstream_constants_carry_goose_literal_intentionally() {
    assert_eq!(UPSTREAM_PROJECT_NAME, "Goose");
    assert!(UPSTREAM_PROJECT_URL.contains("goose"));
    // No other constant should contain "goose" (case-insensitive).
    let other_constants: &[(&str, &str)] = &[
        ("DISPLAY_NAME", DISPLAY_NAME),
        ("PRODUCT_SLUG", PRODUCT_SLUG),
        ("VENDOR", VENDOR),
        ("VENDOR_DOMAIN", VENDOR_DOMAIN),
        ("BUNDLE_ID_MACOS", BUNDLE_ID_MACOS),
        ("APP_USER_MODEL_ID_WINDOWS", APP_USER_MODEL_ID_WINDOWS),
        ("DESKTOP_ENTRY_LINUX", DESKTOP_ENTRY_LINUX),
        ("URL_SCHEME", URL_SCHEME),
        ("ENV_VAR_PREFIX", ENV_VAR_PREFIX),
        ("USER_AGENT_TEMPLATE", USER_AGENT_TEMPLATE),
    ];
    for (name, value) in other_constants {
        assert!(
            !value.to_lowercase().contains("goose"),
            "{name} unexpectedly contains 'goose': {value}"
        );
    }
}
