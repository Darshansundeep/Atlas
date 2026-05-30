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
    "ui/desktop/src/branding"               # branding module — single source of truth
    "crates/atlas-branding"                 # branding crate — single source of truth
    "ui/desktop/src/components/about"       # About surface — attribution lives here
    "ui/desktop/src/components/About"
    "ui/desktop/src/i18n/messages"          # i18n JSON — needs translation PR, not sed sweep
    "crates/goose-cli/src/scenario_tests/recordings"  # recorded LLM responses (model output, not Atlas source)
)

# Per-line directive: if a line contains `// brand-allow` or `# brand-allow`,
# the literal on that line is permitted. Use for clap attribute literals and
# other compile-time constants that can't easily reference branding constants.
BRAND_ALLOW_DIRECTIVE='brand-allow'

# Patterns that, if matched, do NOT count as user-facing literals:
# - test fixtures / snapshots (Goose strings in test data are expected)
# - generated files
# - non-source content surfaces (CSS / SVG comments, Windows batch files,
#   markdown docs, shell scripts) where compile-time literals are required
#   and using IDENTITY.displayName is not possible
EXCLUDE_REGEX='\.(snap|test\.ts|test\.tsx|spec\.ts|spec\.tsx|css|svg|cmd|html|md|sh|ps1|txt|json|yml|yaml|toml)$|/__tests__/|/__fixtures__/|/generated/|/bin/jbang$|/tests/|_test\.rs$|_tests\.rs$'

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
            rest="${line#*:}"
            lineno="${rest%%:*}"
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
            # Per-line brand-allow directive (e.g. clap attribute literals)
            if echo "$line" | grep -q "$BRAND_ALLOW_DIRECTIVE"; then
                continue
            fi
            # Also check the IMMEDIATELY PRECEDING line for brand-allow — useful
            # for raw-string fixtures where the directive cannot live on the
            # offending line itself without becoming part of the string.
            if [[ -n "$lineno" && "$lineno" -gt 1 ]]; then
                prev_line=$(sed -n "$((lineno - 1))p" "$file" 2>/dev/null)
                if echo "$prev_line" | grep -q "$BRAND_ALLOW_DIRECTIVE"; then
                    continue
                fi
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
