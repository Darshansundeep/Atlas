#!/usr/bin/env bash
#
# check-identity-literals.sh
#
# Lints the source tree for literal occurrences of the Atlas product name or
# the upstream Goose project name outside the allowlist.
#
# Contract: specs/001-rebrand-pass/contracts/identity-constants.md (R-IC-004, R-IC-005).
# Spec:     FR-016, FR-IC-005.
#
# This is intentionally conservative: it scans only source code (ui/desktop/src,
# crates/*/src, tools/scripts), not docs / generated files / vendored deps /
# LICENSE / NOTICE / About-screen component.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# Search roots.
ROOTS=(
    "ui/desktop/src"
    "crates"
)

# Allowed paths — these MAY contain literal "Atlas" or "Goose" references.
# Anything matching these globs is excluded from the lint.
ALLOWLIST_PATHS=(
    "ui/desktop/src/branding"               # branding module — the single source of truth
    "crates/atlas-branding"                 # branding crate — the single source of truth
    "ui/desktop/src/components/about"       # About screen — attribution lives here (case-insensitive match)
    "ui/desktop/src/components/About"
)

# Patterns that, if matched, do NOT count as user-facing literals:
# - test fixtures / snapshots (Goose strings in test data are expected)
# - generated files
EXCLUDE_REGEX='\.(snap|test\.ts|test\.tsx|spec\.ts|spec\.tsx)$|/__tests__/|/__fixtures__/|/generated/'

# Build the exclude path arguments for grep.
exclude_args=()
for path in "${ALLOWLIST_PATHS[@]}"; do
    exclude_args+=("--exclude-dir=$(basename "$path")")
done

violations=0

for term in "Atlas" "Goose"; do
    for root in "${ROOTS[@]}"; do
        [[ -d "$root" ]] || continue
        # Find files containing the term, exclude allowlist paths/regexes
        # using a two-pass grep + post-filter for precision.
        while IFS= read -r line; do
            file="${line%%:*}"
            # Skip allowlisted paths
            skip=0
            for allow in "${ALLOWLIST_PATHS[@]}"; do
                if [[ "$file" == "$allow"* ]]; then
                    skip=1; break
                fi
            done
            [[ $skip -eq 1 ]] && continue
            # Skip excluded patterns
            if echo "$file" | grep -qE "$EXCLUDE_REGEX"; then
                continue
            fi
            echo "VIOLATION  '$term' literal in $line"
            violations=$((violations + 1))
        done < <(grep -RInE "\b${term}\b" "$root" 2>/dev/null || true)
    done
done

if [[ $violations -gt 0 ]]; then
    echo ""
    echo "$violations identity literal(s) outside the allowlist."
    echo "Allowed paths: ${ALLOWLIST_PATHS[*]}"
    echo "Contract:      specs/001-rebrand-pass/contracts/identity-constants.md R-IC-004"
    echo "Fix:           import the constant from ui/desktop/src/branding/ (UI) or crates/atlas-branding (Rust)."
    exit 1
fi
echo "No identity literals outside the allowlist."
