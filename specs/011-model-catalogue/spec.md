# Feature Specification: Central Model Catalogue

**Feature Branch**: `011-model-catalogue`
**Status**: shipped (17 seeded models, admin CRUD)
**Created**: 2026-05-31

## Problem

Atlas's per-user pricing overrides (spec 007) live locally on each
device. The LLM proxy (spec 003) needs a server-side source of truth
for `(provider, model) → price` so it can compute billing centrally.
Admins need to update prices when providers change them. Org-level
overrides (above per-user, below catalogue) ship later with spec 021.

## Implementation status — 2026-05-31

**Shipped**:

Postgres table `model_catalogue` (provider, model PK):
- `input_per_million NUMERIC(10,4)`, `output_per_million NUMERIC(10,4)`
- `context_window`, `capabilities JSONB`, `currency`, `deprecated`, `notes`
- `updated_at`

Seeded via `services/atlas-auth-api/src/db/seed-catalogue.sql` — 17
frontier + budget models as of 2026-05:
- Anthropic: Opus 4.5, Sonnet 4.6, Haiku 4.5
- OpenAI: GPT-4o, GPT-4o mini, o3, o4-mini
- Google: Gemini 2.5 Pro, 2.5 Flash
- xAI, Meta Llama 4, DeepSeek R1/V3, Mistral Large 2, Cohere R+
- Local: Ollama Llama 3.3, Mistral Nemo (free)

Admin endpoints:
- `GET    /admin/v1/catalogue` — list all
- `POST   /admin/v1/catalogue` — upsert (price-range validated 0..1000)
- `DELETE /admin/v1/catalogue/:provider/:model`

Admin panel Models tab provides UI for all three.

Consumed by:
- `services/atlas-llm-proxy/src/usage.ts::getCataloguePrice()` (cached 5min)
- Admin People-tab cost columns
- Desktop CostTracker (consults override → catalogue cascade)

## Pending

| Item | Notes |
|---|---|
| Per-org overrides | Waits on spec 021 orgs. Will be `org_pricing_overrides(org_id, provider, model, input_per_million, output_per_million)` with precedence org > user > catalogue. |
| Sync from upstream providers | When Anthropic updates prices, we have to update by hand today. Future: a scheduled job that pulls from each provider's catalogue endpoint. |
| Catalogue version history (mirror of spec 022's pattern) | Useful for "what was the price last month?" billing reconciliation. |

## Constitution touchpoints

None directly — this is internal data management, no user prompts or
tokens involved.

## Acceptance criteria (already met)

- ✓ All 17 seeded models load on `pnpm run migrate`.
- ✓ Upserting a price persists; LLM proxy reads the new price within
  5 min (cache TTL).
- ✓ Invalid price ($99,999) rejected with 400.
- ✓ Admin token required for write; reads are admin-only too at v1.
