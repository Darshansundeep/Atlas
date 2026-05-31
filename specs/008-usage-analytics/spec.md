# Feature Specification: Usage Analytics Page (Tokens / Tool Calls / Cost)

**Feature Branch**: `008-usage-analytics`
**Status**: v0.3 shipped (analytics page + ledger). v0.4 (tool-call ledger) pending.
**Created**: 2026-05-31

## Implementation status — 2026-05-31

**Shipped**:
- v0.1: Usage tab in sidebar (gated by `FEATURES.usagePage`). Reads
  `listSessions()`, aggregates by (provider, model), 4 stat cards
  (Sessions / Tokens in / Tokens out / Cost), Top models table, time
  window picker (Today / 7d / 30d / All time).
- v0.2: 5th stat card "Tool calls" + Top tools table, sourced from
  live session conversation walk.
- v0.3: **Append-only usage ledger** at
  `~/Library/Application Support/Atlas/usage-history.jsonl`. Before
  any session is deleted (per-row OR Delete-all), its
  `{tokens, cost, provider, model, createdAt}` is snapshotted. Usage
  page merges live sessions + ledger entries, de-duped by sessionId.
  Footer shows "Includes N archived sessions" when ledger is
  non-empty.

**Pending — v0.4** (ROADMAP.md item B1):
- Tool-call counts surviving Delete-all (ledger snapshots tokens but
  not tool-call breakdowns yet). Adds `toolCallCounts: Record<string, number>`
  to the ledger entry shape; UsagePage merges that into the `tools`
  map in aggregate().

## Problem

Atlas users (and especially org admins) have no visibility into their own usage:

- How many tokens did I send + receive this week?
- Which models did I use most?
- How many tool calls did I make? Which tools fired most often?
- What did this cost me (combined with the per-model prices from spec `007-provider-pricing`)?
- How does this session compare to last week?

Today, individual data points exist (per-message token counts, per-tool-call status) but there is no aggregated view. This blocks self-service quota awareness, blocks the future admin-console (`021`) per-org dashboard, and removes a natural place to surface the upgrade prompt for Free → Pro users approaching their quota.

## Desired behaviour

1. New top-level navigation item: **Usage** (sidebar, between Session History and Settings). Gated by `FEATURES.usagePage` (off by default in v1, enable per release).
2. Dashboard cards:
   - **Tokens used today / this week / this month** (sent + received split)
   - **Cost today / this week / this month** (uses spec 007 pricing)
   - **Top 5 models by usage**
   - **Top 10 tool calls by invocation count**
   - **Daily token sparkline** (last 30 days)
3. Filter by session, by model, by tool.
4. Export to CSV / JSON.
5. Admin tier (post spec `021-admin-console`): see org-wide aggregations, drill down per user.

## Open questions for `/speckit-clarify`

1. Storage backend — local SQLite per-user (privacy-first) vs cloud aggregation (admin visibility)?
2. Retention period — last 30 days only, or unbounded?
3. What's the "cost" formula for non-cloud (local Ollama) models — $0 or amortised compute estimate?
