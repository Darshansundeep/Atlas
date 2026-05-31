# atlas-llm-proxy

Token-metered access to frontier LLMs via Atlas Cloud. Spec 003.

The flow:

```
Atlas desktop  ──Bearer atlas JWT──▶  atlas-llm-proxy  ──provider API key──▶  Anthropic / OpenAI / Google
                                       (verify JWT)
                                       (preflight quota — Principle V)
                                       (forward; record usage_event)
```

JWT verification reuses `JWT_SIGNING_SECRET` from `atlas-auth-api` (same
issuer + audience). Postgres is the same DB; we read `subscription_state`
+ `model_catalogue` and write `usage_events`.

## Local dev

```bash
# Postgres + atlas-auth-api are already running (see services/atlas-auth-api).

cd services/atlas-llm-proxy
pnpm install
cp .dev.vars.example .dev.vars
# Set ANTHROPIC_API_KEY for real calls; without it the proxy returns 503.
pnpm run dev
# → listening on http://127.0.0.1:8788  (anthropic=on)
```

## Smoke test (with valid Atlas JWT)

```bash
ATLAS_JWT="...obtained from /v1/auth/token grant..."

curl -sS http://127.0.0.1:8788/v1/quota \
  -H "authorization: Bearer $ATLAS_JWT" | jq .
# → {"tier":"free","daily_cap_usd":2,"used_today_usd":0,"remaining_today_usd":2}

curl -sS http://127.0.0.1:8788/v1/messages \
  -H "authorization: Bearer $ATLAS_JWT" \
  -H 'content-type: application/json' \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 64,
    "messages": [{"role":"user","content":"say hi"}]
  }' | jq .
```

## Endpoints (v0.1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/messages` | Atlas Bearer | Forwards to Anthropic, records usage |
| GET | `/v1/quota` | Atlas Bearer | Current tier + USD cap + today's spend |
| GET | `/healthz` | none | Liveness |

## What's IN this scaffold

- Atlas-JWT verification (HS256, same secret as auth backend)
- Per-user daily-USD quota preflight (Principle V — NON-NEGOTIABLE)
- Anthropic provider adapter (Messages API, streaming + non-streaming)
- Catalogue-priced usage_event accounting (writes to shared Postgres)
- Tier-based daily caps from env

## What's NOT yet (next passes)

- OpenAI + Google provider adapters
- Mid-stream usage extraction (today's metering for stream=true is
  best-effort — Anthropic's final `message_delta` SSE event carries
  usage and we'd need a tee adapter to capture it)
- Real-time rate limiting (req/min per user)
- Org-scoped quotas (waits on spec 021 RBAC)
- Cost-anomaly alerts (waits on spec 008 history)

## Constitution touchpoints

- **Principle I**: BYOK users never traverse this service. This is opt-in
  for cloud-billing customers.
- **Principle V (NON-NEGOTIABLE)**: hard daily caps enforced BEFORE any
  provider call. See `src/quota.ts` `preflight()`.
- **R-API-004**: tokens never logged. `forwardAnthropic` does NOT log the
  upstream API key, request body, or response. Errors include status +
  request-id, never bodies.
