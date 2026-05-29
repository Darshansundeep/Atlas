#!/usr/bin/env bash
#
# check-identity-in-sync.sh
#
# Asserts that the UI branding module (TypeScript) and the Rust branding crate
# expose identical identity constants. Run by CI job `identity-constants-in-sync`.
#
# Contract: specs/001-rebrand-pass/contracts/identity-constants.md (R-IC-003).
#
# This is a lightweight string-extraction check rather than a TypeScript-aware
# parser. If a future edit moves the constants out of simple `key: 'value'`
# form, this script must be updated in the same PR.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UI="$REPO_ROOT/ui/desktop/src/branding/index.ts"
RS="$REPO_ROOT/crates/atlas-branding/src/lib.rs"

fail=0

extract_ui() {
    # extract 'key: '<value>',  → <value>
    grep -E "^[[:space:]]+$1:[[:space:]]*'" "$UI" | head -1 | sed -E "s/.*: *'([^']+)'.*/\1/"
}

extract_rs() {
    # extract pub const KEY: &str = "<value>"; → <value>
    grep -E "^pub const $1: &str = " "$RS" | head -1 | sed -E 's/.*= *"([^"]+)".*/\1/'
}

check() {
    local label="$1" ui_key="$2" rs_key="$3"
    local ui_val rs_val
    ui_val="$(extract_ui "$ui_key")"
    rs_val="$(extract_rs "$rs_key")"
    if [[ -z "$ui_val" || -z "$rs_val" ]]; then
        echo "FAIL  $label  could not extract (ui='$ui_val' rs='$rs_val')" >&2
        fail=1
        return
    fi
    if [[ "$ui_val" != "$rs_val" ]]; then
        echo "FAIL  $label  ui='$ui_val'  rs='$rs_val'" >&2
        fail=1
    else
        echo "OK    $label  '$ui_val'"
    fi
}

# Map UI keys (camelCase) ↔ Rust keys (SCREAMING_SNAKE_CASE).
check "displayName"           displayName             DISPLAY_NAME
check "productSlug"           productSlug             PRODUCT_SLUG
check "vendor"                vendor                  VENDOR
check "vendorDomain"          vendorDomain            VENDOR_DOMAIN
check "bundleIdMacos"         bundleIdMacos           BUNDLE_ID_MACOS
check "appUserModelIdWindows" appUserModelIdWindows   APP_USER_MODEL_ID_WINDOWS
check "desktopEntryLinux"     desktopEntryLinux       DESKTOP_ENTRY_LINUX
check "urlScheme"             urlScheme               URL_SCHEME
check "envVarPrefix"          envVarPrefix            ENV_VAR_PREFIX
check "upstreamProjectName"   upstreamProjectName     UPSTREAM_PROJECT_NAME
check "upstreamProjectUrl"    upstreamProjectUrl      UPSTREAM_PROJECT_URL
check "upstreamPinnedVersion" upstreamPinnedVersion   UPSTREAM_PINNED_VERSION

# User-Agent templates use different placeholder syntax (TS uses ${} interpolation,
# Rust uses {} placeholders for replace()), so compare structurally not literally.
ui_ua="$(extract_ui userAgentTemplate)"
rs_ua="$(grep -E '^pub const USER_AGENT_TEMPLATE' "$RS" | head -1 | sed -E 's/.*= *"([^"]+)".*/\1/')"
ui_norm="$(echo "$ui_ua" | sed 's/\${version}/{version}/; s/\${os}/{os}/')"
if [[ "$ui_norm" != "$rs_ua" ]]; then
    echo "FAIL  userAgentTemplate  ui(norm)='$ui_norm'  rs='$rs_ua'" >&2
    fail=1
else
    echo "OK    userAgentTemplate  '$rs_ua'"
fi

if [[ $fail -ne 0 ]]; then
    echo "" >&2
    echo "Identity drift detected. Update both files in the same commit." >&2
    echo "Contract: specs/001-rebrand-pass/contracts/identity-constants.md R-IC-003" >&2
    exit 1
fi
echo "All identity constants in sync."
