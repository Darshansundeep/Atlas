# Feature Specification: Usage Analytics Page (Tokens / Tool Calls / Cost)

**Feature Branch**: `008-usage-analytics`
**Status**: Stub — full draft pending `/speckit-specify`
**Created**: 2026-05-31

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
