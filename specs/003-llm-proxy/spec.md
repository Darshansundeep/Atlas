# Feature Specification: Atlas LLM Proxy

**Feature Branch**: `003-llm-proxy`
**Status**: v0.1 scaffold shipped (Anthropic only); v0.2 = OpenAI + Google + streaming-usage
**Created**: 2026-05-31

## Problem

Atlas Cloud paid tiers need a proxy between the desktop and the LLM
providers so we can:
- Enforce per-user daily-USD spend caps (Constitution Principle V —
  NON-NEGOTIABLE — hard caps BEFORE any provider call)
- Hold the provider API key server-side (so users don't carry one)
- Record usage events centrally for billing + spec 008 analytics
- Apply tier-based rate limits and entitlement checks

BYOK mode bypasses this entirely (Constitution Principle I — prompts
never traverse Atlas infra in BYOK).

## Implementation status — 2026-05-31

**Shipped — v0.1** (`services/atlas-llm-proxy/`, 7/7 integration checks):

| Endpoint | Behaviour |
|---|---|
| `GET  /healthz` | liveness |
| `GET  /v1/quota` | returns `{tier, daily_cap_usd, used_today_usd, remaining_today_usd}` for the bearer's user |
| `POST /v1/messages` | Atlas-JWT verify → quota preflight → forward to Anthropic with server-held `ANTHROPIC_API_KEY` → record `usage_event` |

Quota preflight reads `subscription_state.tier`, sums today's
`SUM(cost_usd)` from `usage_events`, refuses with 402
`quota_exceeded` when ≥ tier's daily cap. The 402 is recorded as
its own `usage_events` row with `status=quota_exceeded`.

JWT verification reuses `JWT_SIGNING_SECRET` from spec 002. Same
iss=`https://api.atlas.netgroup.ai`, aud=`atlas-desktop`.

**Pending — v0.2** (ROADMAP.md item A2):

| # | Item |
|---|---|
| T201 | `services/atlas-llm-proxy/src/providers/openai.ts` — Chat-Completions adapter |
| T202 | `services/atlas-llm-proxy/src/providers/google.ts` — Gemini adapter |
| T203 | Provider router on `body.atlas_provider` or content-type sniff |
| T204 | Streaming usage extraction — tee Anthropic's `message_delta` SSE event so we capture usage on streamed responses (today stream=true skips post-call accounting) |
| T205 | Real-time rate limits (req/min/user) — Cloudflare Durable Object or in-memory token bucket |
| T206 | Cost-anomaly alerts — flag accounts spending >3σ of their 7-day baseline |
| T207 | Provider failover — if Anthropic 5xx, try the next |
| T208 | Per-skill markup (waits on spec 024) |

## Constitution touchpoints

- **Principle V** (NON-NEGOTIABLE) — hard daily/monthly caps enforced
  BEFORE provider call. Implemented in `quota.preflight()`. Verified
  by integration test T6: inserting $10 fake usage → next /v1/messages
  returns 402 with no provider attempt.
- **Principle I** — BYOK never traverses this service. Verified by
  desktop only routing here for signed-in cloud requests.
- **R-API-004** — tokens never logged. `forwardAnthropic` does not log
  the upstream API key, request body, or response body. Errors include
  status + request-id only.

## Files

```
services/atlas-llm-proxy/
  package.json
  tsconfig.json
  README.md                          local-dev recipe
  .dev.vars.example                  config template
  src/
    server-node.ts                   :8788 entrypoint
    app.ts                           Hono routes
    auth.ts                          Atlas-JWT verify
    quota.ts                         preflight + per-tier caps
    usage.ts                         catalogue-priced cost + recordUsage
    providers/
      anthropic.ts                   Messages-API adapter
      openai.ts                      (pending v0.2)
      google.ts                      (pending v0.2)
```

## Test plan (next session)

- T201 / T202 unit-test each provider adapter against canned upstream
  responses (no network).
- T204 streaming test: kick off a stream=true request, capture the
  final usage event, verify `usage_events` row has correct token counts.
- End-to-end: real Anthropic key, real chat, real billing increment.

## Acceptance criteria for v1 launch

- All 3 major providers (Anthropic, OpenAI, Google) work through the
  proxy.
- Stream + non-stream both meter correctly.
- Tier daily cap actually stops a user when they hit it (verified live
  against a $0.10 test cap).
- Token-leak-scan CI catches any accidental log of an API key, prompt,
  or response.
