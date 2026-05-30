#!/usr/bin/env bash
#
# verify-attribution.sh
#
# Confirms upstream Goose's LICENSE (and NOTICE, if upstream ships one) are
# present at the repo root and unmodified relative to the pinned upstream tag.
#
# Task: T045.
# Spec:  FR-008, FR-009, SC-004.
# Constitution: Principle III (License Hygiene, NON-NEGOTIABLE).
#
# Run by CI job `verify-attribution` in atlas-ci.yml; can also be run locally:
#   bash tools/scripts/verify-attribution.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

UPSTREAM_VERSION_FILE="UPSTREAM_VERSION"
[[ -f "$UPSTREAM_VERSION_FILE" ]] || {
    echo "FAIL: $UPSTREAM_VERSION_FILE missing — cannot verify attribution"
    exit 1
}

# Parse the pinned SHA-256 from UPSTREAM_VERSION.
pinned_license_sha=$(grep -E "^license_sha256:" "$UPSTREAM_VERSION_FILE" | awk '{print $2}')
pinned_notice_sha=$(grep -E "^notice_sha256:"  "$UPSTREAM_VERSION_FILE" | awk '{print $2}')

[[ -n "$pinned_license_sha" ]] || {
    echo "FAIL: no license_sha256 pinned in $UPSTREAM_VERSION_FILE"
    exit 1
}

# 1. LICENSE must exist and match the pin.
[[ -f LICENSE ]] || { echo "FAIL: LICENSE file missing from repo root"; exit 1; }
live_license_sha=$(shasum -a 256 LICENSE | awk '{print $1}')
if [[ "$live_license_sha" != "$pinned_license_sha" ]]; then
    echo "FAIL: LICENSE has drifted from upstream pin."
    echo "      pinned  = $pinned_license_sha"
    echo "      current = $live_license_sha"
    echo "Reconcile by either (a) restoring upstream LICENSE byte-for-byte, or"
    echo "(b) re-pinning in $UPSTREAM_VERSION_FILE after consciously accepting an"
    echo "upstream LICENSE change (requires Constitution review)."
    exit 1
fi
echo "OK    LICENSE matches pinned sha256 ($pinned_license_sha)"

# 2. NOTICE: only checked if the pin says one should exist.
if [[ "$pinned_notice_sha" != "n/a"* && -n "$pinned_notice_sha" ]]; then
    [[ -f NOTICE ]] || { echo "FAIL: NOTICE pin says file should exist; it does not"; exit 1; }
    live_notice_sha=$(shasum -a 256 NOTICE | awk '{print $1}')
    if [[ "$live_notice_sha" != "$pinned_notice_sha" ]]; then
        echo "FAIL: NOTICE has drifted from upstream pin."
        exit 1
    fi
    echo "OK    NOTICE matches pinned sha256"
else
    # Upstream v1.36.0 ships no NOTICE; Apache 2.0 §4(d) is not engaged.
    if [[ -f NOTICE ]]; then
        echo "WARN  NOTICE present at repo root but pin says upstream has none."
        echo "      Investigate: either upstream added a NOTICE (re-pin), or someone"
        echo "      added an Atlas-owned NOTICE (should be in NOTICE-ATLAS instead)."
        exit 1
    fi
    echo "OK    NOTICE absent (matches pin: upstream ships none at this tag)"
fi

# 3. NOTICE-ATLAS — append-only Atlas-owned attribution file. Just a presence check.
[[ -f NOTICE-ATLAS ]] || {
    echo "FAIL: NOTICE-ATLAS missing — required by Constitution Principle III as the"
    echo "      append-only home for Atlas-owned third-party attributions."
    exit 1
}
echo "OK    NOTICE-ATLAS present"

echo "All attribution gates passed."
