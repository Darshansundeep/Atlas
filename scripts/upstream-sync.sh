#!/usr/bin/env bash
# Spec 026 — upstream-sync triage tool.
#
# Fetches the upstream Goose repo and prints a triage table of every commit
# Atlas hasn't yet decided on. Suggests an action (TAKE / OVERLAY / SKIP / DEFER)
# based on heuristics over the files each commit touches.

set -euo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/block/goose.git}"
LAST_SYNC_FILE="${LAST_SYNC_FILE:-UPSTREAM_VERSION}"

if [[ ! -f "$LAST_SYNC_FILE" ]]; then
  echo "error: $LAST_SYNC_FILE not found — run from repo root" >&2
  exit 2
fi

LAST_PINNED=$(cat "$LAST_SYNC_FILE" | tr -d '[:space:]')
if [[ -z "$LAST_PINNED" ]]; then
  echo "error: $LAST_SYNC_FILE is empty" >&2
  exit 2
fi

if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  echo "Adding $UPSTREAM_REMOTE → $UPSTREAM_URL" >&2
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

echo "Fetching $UPSTREAM_REMOTE..." >&2
git fetch --tags "$UPSTREAM_REMOTE" >/dev/null

UPSTREAM_HEAD=$(git rev-parse "$UPSTREAM_REMOTE/main" 2>/dev/null || git rev-parse "$UPSTREAM_REMOTE/master")

echo "Atlas pinned at: $LAST_PINNED" >&2
echo "Upstream HEAD : $UPSTREAM_HEAD" >&2
echo >&2

# Suggest an action per commit. Heuristics:
#   - branding/identity touches      -> OVERLAY
#   - test-only changes              -> TAKE
#   - vendor telemetry / Block URLs  -> SKIP
#   - docs only                      -> TAKE
#   - everything else                -> review (DEFER)
suggest() {
  local files="$1"
  if echo "$files" | grep -qiE '(branding|identity|brand|logo|icon|theme-tokens)'; then
    echo OVERLAY
    return
  fi
  if echo "$files" | grep -qE '\.(md|txt|rst)$' && ! echo "$files" | grep -qvE '\.(md|txt|rst)$'; then
    echo TAKE
    return
  fi
  if echo "$files" | grep -qiE '(squarecdn|block\.xyz|telemetry-endpoint|posthog|honeycomb|datadog)'; then
    echo SKIP
    return
  fi
  if echo "$files" | grep -qE '(\.test\.|/tests?/|playwright|vitest)' && ! echo "$files" | grep -qvE '(\.test\.|/tests?/|playwright|vitest)'; then
    echo TAKE
    return
  fi
  echo DEFER
}

printf "%-9s  %-8s  %s\n" "ACTION" "SHA" "SUBJECT"
printf "%-9s  %-8s  %s\n" "-------" "--------" "--------"
git log --reverse --no-merges --format='%H%x09%s' "$LAST_PINNED..$UPSTREAM_HEAD" | while IFS=$'\t' read -r sha subject; do
  short=$(echo "$sha" | cut -c1-8)
  files=$(git show --stat --format='' "$sha" | awk 'NF >= 3 { print $1 }' | tr '\n' ' ')
  action=$(suggest "$files")
  # Truncate subject
  trimmed=$(echo "$subject" | cut -c1-90)
  printf "%-9s  %-8s  %s\n" "$action" "$short" "$trimmed"
done

echo >&2
echo "Next steps:" >&2
echo "  - For TAKE: git cherry-pick <sha>" >&2
echo "  - For OVERLAY: cherry-pick then hand-edit, OR write the overlay change in a new commit" >&2
echo "  - For SKIP: record rationale in specs/026-upstream-sync/reports/$(date +%F).md" >&2
echo "  - After: update $LAST_SYNC_FILE to the new upstream tag, update IDENTITY.upstreamPinnedVersion" >&2
