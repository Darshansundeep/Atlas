//! Integration tests for `atlas-branding`.
//!
//! Asserts that the public identity constants are well-formed and that they
//! agree with the TypeScript branding module at
//! `ui/desktop/src/branding/index.ts`. The TS side is parsed lightly (string
//! extract), mirroring what `tools/scripts/check-identity-in-sync.sh` does
//! in CI — but here it runs as part of `cargo test`, so a Rust developer
//! gets the failure locally without needing CI.
//!
//! Contracts: `specs/001-rebrand-pass/contracts/identity-constants.md`.
//! Task: T013.

use atlas_branding::*;
use std::fs;
use std::path::PathBuf;

fn ui_branding_source() -> String {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // crates/atlas-branding/ → repo root
    path.pop();
    path.pop();
    path.push("ui/desktop/src/branding/index.ts");
    fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!("could not read {}: {e}", path.display());
    })
}

fn extract_ui_value(source: &str, key: &str) -> Option<String> {
    // Find `<indent>key: '<value>',`
    let needle = format!("{key}:");
    let line = source.lines().find(|l| l.trim_start().starts_with(&needle))?;
    let after_colon = line.split_once(':')?.1.trim();
    // Strip optional leading apostrophe, take until the next apostrophe.
    let inner = after_colon.trim_start_matches('\'');
    let end = inner.find('\'')?;
    Some(inner[..end].to_string())
}

#[test]
fn display_name_matches_ui() {
    let src = ui_branding_source();
    assert_eq!(
        extract_ui_value(&src, "displayName").as_deref(),
        Some(DISPLAY_NAME),
        "DISPLAY_NAME drift: rust='{DISPLAY_NAME}'"
    );
}

#[test]
fn product_slug_matches_ui() {
    let src = ui_branding_source();
    assert_eq!(extract_ui_value(&src, "productSlug").as_deref(), Some(PRODUCT_SLUG));
}

#[test]
fn vendor_matches_ui() {
    let src = ui_branding_source();
    assert_eq!(extract_ui_value(&src, "vendor").as_deref(), Some(VENDOR));
}

#[test]
fn bundle_id_macos_matches_ui() {
    let src = ui_branding_source();
    assert_eq!(extract_ui_value(&src, "bundleIdMacos").as_deref(), Some(BUNDLE_ID_MACOS));
}

#[test]
fn url_scheme_matches_ui() {
    let src = ui_branding_source();
    assert_eq!(extract_ui_value(&src, "urlScheme").as_deref(), Some(URL_SCHEME));
}

#[test]
fn env_var_prefix_matches_ui() {
    let src = ui_branding_source();
    assert_eq!(extract_ui_value(&src, "envVarPrefix").as_deref(), Some(ENV_VAR_PREFIX));
}

#[test]
fn upstream_attribution_matches_ui() {
    let src = ui_branding_source();
    assert_eq!(
        extract_ui_value(&src, "upstreamProjectName").as_deref(),
        Some(UPSTREAM_PROJECT_NAME)
    );
    assert_eq!(
        extract_ui_value(&src, "upstreamProjectUrl").as_deref(),
        Some(UPSTREAM_PROJECT_URL)
    );
    assert_eq!(
        extract_ui_value(&src, "upstreamPinnedVersion").as_deref(),
        Some(UPSTREAM_PINNED_VERSION)
    );
}

#[test]
fn upstream_version_file_matches_constant() {
    // The repo-root UPSTREAM_VERSION file is the single source of truth for the
    // upstream pin; the branding crate constant MUST agree.
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.pop();
    path.pop();
    path.push("UPSTREAM_VERSION");
    let content = fs::read_to_string(&path).expect("UPSTREAM_VERSION must exist at repo root");
    assert!(
        content.contains(UPSTREAM_PINNED_VERSION),
        "UPSTREAM_PINNED_VERSION ('{UPSTREAM_PINNED_VERSION}') not present in UPSTREAM_VERSION file"
    );
}
