#!/usr/bin/env bash
#
# Coexistence integration test — Atlas and upstream Goose installed on the
# same machine MUST NOT read, modify, or claim each other's state.
#
# Task: T053a.
# Spec: SC-005, Edge Cases (spec.md).
# Constitution: Principle I (User Data Sovereignty), Principle IV (Cross-platform parity).
#
# STATUS: This is a SCAFFOLD. Full execution requires:
#   - A built Atlas .app/.exe/.AppImage on the runner.
#   - A built upstream Goose binary at a pinned version.
#   - Permission to install both into per-user paths on the CI runner.
#   - Working keychain access on each OS (`security` on macOS, Credential
#     Manager on Windows, libsecret on Linux).
#
# The scaffold below shows the invariants. CI wires it up in a future PR
# once T039 (release pipeline) produces installable artifacts.

set -euo pipefail

if [[ "${ATLAS_COEXISTENCE_TEST_ENABLED:-0}" != "1" ]]; then
    echo "SKIP: ATLAS_COEXISTENCE_TEST_ENABLED is not 1 (artifact builds not wired yet)."
    echo "      This script will be invoked from .github/workflows/atlas-ci.yml after T039."
    exit 0
fi

OS="$(uname -s)"

config_path_atlas() {
    case "$OS" in
        Darwin)  echo "$HOME/Library/Application Support/Atlas" ;;
        Linux)   echo "$HOME/.config/atlas" ;;
        MINGW*|MSYS*|CYGWIN*) echo "$APPDATA/Atlas" ;;
        *) echo "unsupported OS: $OS" >&2; exit 2 ;;
    esac
}

config_path_goose() {
    case "$OS" in
        Darwin)  echo "$HOME/Library/Application Support/Goose" ;;
        Linux)   echo "$HOME/.config/goose" ;;
        MINGW*|MSYS*|CYGWIN*) echo "$APPDATA/Goose" ;;
        *) echo "unsupported OS: $OS" >&2; exit 2 ;;
    esac
}

ATLAS_CFG="$(config_path_atlas)"
GOOSE_CFG="$(config_path_goose)"

# Pre-flight: ensure both binaries exist on PATH.
command -v atlas >/dev/null || { echo "FAIL: atlas binary not on PATH"; exit 1; }
command -v goose >/dev/null || { echo "FAIL: goose binary not on PATH (install upstream pinned version)"; exit 1; }

# 1. Sentinel: write a unique marker into Goose's config dir BEFORE running Atlas.
mkdir -p "$GOOSE_CFG"
GOOSE_SENTINEL="$GOOSE_CFG/.coexistence-sentinel-$(date +%s)"
echo "do-not-touch-me" > "$GOOSE_SENTINEL"

# 2. Boot Atlas in a representative flow (CLI run-once is fine for filesystem isolation).
atlas --version > /dev/null

# 3. Assert: Goose's sentinel is BYTE-EQUAL after Atlas ran.
if ! diff -q "$GOOSE_SENTINEL" <(echo "do-not-touch-me") >/dev/null; then
    echo "FAIL: Atlas modified Goose's sentinel file at $GOOSE_SENTINEL"
    exit 1
fi

# 4. Assert: Atlas created its OWN config dir (not Goose's).
if [[ ! -d "$ATLAS_CFG" ]]; then
    echo "FAIL: Atlas did not create its own config dir at $ATLAS_CFG"
    exit 1
fi

# 5. Assert: Atlas's config dir does not contain Goose-sentinel content.
if grep -RIE "do-not-touch-me" "$ATLAS_CFG" 2>/dev/null; then
    echo "FAIL: Goose sentinel content found inside Atlas config dir — state leaked across the boundary"
    exit 1
fi

# 6. Symmetric check: now run upstream Goose, assert it doesn't touch Atlas's dir.
ATLAS_SENTINEL="$ATLAS_CFG/.coexistence-sentinel-$(date +%s)"
echo "atlas-only" > "$ATLAS_SENTINEL"
goose --version > /dev/null
if ! diff -q "$ATLAS_SENTINEL" <(echo "atlas-only") >/dev/null; then
    echo "FAIL: Goose modified Atlas's sentinel"
    exit 1
fi

# Cleanup
rm -f "$GOOSE_SENTINEL" "$ATLAS_SENTINEL"

# 7. URL-scheme registration check is platform-specific and lives in a sibling
#    script (TODO: tests/integration/url-scheme-isolation.sh) to avoid coupling.

echo "PASS: Atlas ↔ Goose coexistence — no state leakage observed on $OS."
