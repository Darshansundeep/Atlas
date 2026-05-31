# Feature Specification: Per-Provider / Per-Model Pricing Configuration

**Feature Branch**: `007-provider-pricing`
**Status**: Stub — full draft pending `/speckit-specify`
**Created**: 2026-05-31

## Problem

Atlas displays token counters and cost-tracking UI (CostTracker.tsx), but there is no settings surface where an admin or user can set the **price per 1M tokens** for a configured LLM model. Currently the prices come from a hard-coded `models.dev`-style catalogue that may be stale. For accurate cost tracking — and for spec `024-skill-pricing` to compute per-user spend correctly — an admin needs a place to define / override pricing per provider × model.

Related to the user question: *"Where I can set the price of the models?"* — the answer today is: nowhere in the UI. Catalogue prices are read-only.

## Desired behaviour

1. Settings → **Models & Pricing** sub-tab (admin-visible only in v1; per-user in v1.1).
2. List of all configured (provider, model) pairs with their current `input_price_per_million`, `output_price_per_million`, and `cache_hit_discount` fields.
3. Each row is editable in place; saved values override the catalogue default.
4. Reset-to-catalogue affordance per row.
5. CostTracker reads the override first, catalogue second.
6. Per-org overrides (post spec `021-admin-console`) layered on top, with precedence: org-override > user-override > catalogue.

## Open questions for `/speckit-clarify`

1. Where is the source of truth — local file `~/.config/atlas/pricing.yaml`, OS keychain (no), or remote `api.atlas.netgroup.ai/v1/pricing`?
2. Should "free" providers (local Ollama, Hermes) show `$0` cells or be excluded from the table?
3. Currency — fixed USD or user-selectable display currency with FX conversion?
