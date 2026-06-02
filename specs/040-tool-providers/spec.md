# Feature Specification: Tool Providers (Web Search, Scraping, Custom HTTP)

**Feature Branch**: `040-tool-providers`
**Status**: v0.1 shipped (admin config + encrypted key storage + per-tier quotas). v0.2 (runtime + MCP extension) pending.
**Created**: 2026-06-02

## Problem

Atlas's agent has the **Developer** extension (shell + file edits) by
default — strong for local work but it can't see the web. To compete
with Claude / Cursor / Cline for research / scraping / agentic-web
tasks, Atlas needs a **server-side proxy to web search and scraping
providers**, with API keys held centrally and per-user quotas enforced
by the Atlas backend (Constitution Principle V — hard caps BEFORE any
upstream call).

Multiple providers exist (Brave, Tavily, Serper, Firecrawl, Bright
Data, Apify, plus customer-internal endpoints), each with its own
API shape + cost model. The admin needs:
- A single place to configure all providers
- API keys encrypted at rest (never in env files for prod)
- Per-tier quotas independent of LLM-spend quotas (spec 003)
- The ability to add a customer's "own setup" (custom HTTP endpoint)

The user explicitly asked: *"I want the provider and API options to
be there on the admin UI so that I can use multiple platforms such
as brave, Tavily, firecrawl, my own setup, serper etc"* (2026-06-02).

## Desired behaviour

### Architecture (4 layers)

```
1. Upstream providers     Brave · Tavily · Serper · Firecrawl · custom
       ▲
       │  server-held keys, never to desktop
2. Atlas backend tools    POST /v1/tools/web/search · /web/scrape (Bearer'd)
                          Per-tier quota preflight (Principle V)
                          Records to tool_usage_events
       ▲
       │  MCP tool call
3. atlas-web-tools (MCP)  Tools the agent sees: web_search, web_scrape, read_url
       ▲
       │  used by Skills' instructions_md
4. Skills (spec 022)      "Web Research" skill references the extension
```

### Admin UX

- **Tools tab** in the admin panel next to Skills
- **Providers table**: name slug, display name, type, kind, masked
  key (`••••XXXX`), rate limit, enabled/disabled, actions (Edit /
  Delete)
- **Add/edit form**:
  - Quick-start template picker (Brave / Tavily / Serper / Firecrawl /
    Custom HTTP) that pre-fills base URL + auth scheme + notes
  - Slug + display name + kind + provider type + base URL (custom only)
  - Auth scheme dropdown: Bearer / X-API-Key / X-Subscription-Token /
    `?key=` / Custom (config-driven)
  - API key (password input — encrypted before storage)
  - Rate limit RPM
  - Enabled toggle
- **Per-tier quota matrix** (free / pro / team / enterprise):
  searches/day, scrapes/day, budget USD/day (NULL = unlimited)

### Key security

- API keys encrypted at rest via `pgcrypto` `pgp_sym_encrypt` with a
  symmetric passphrase from `TOOL_KEY_ENCRYPTION_PASSPHRASE` (env).
- Responses **never** include the plaintext key — only `api_key_hint`
  (last 4 chars) for visual confirmation.
- Plaintext is only decrypted server-side at call time by the proxy.
- Rotating the passphrase requires re-saving every provider's key.

### Quota enforcement (v0.2)

- Pre-flight check (`SELECT SUM(cost_usd)` for today's `tool_usage_events`)
  BEFORE any upstream call.
- Refuses with 402 `quota_exceeded` once over the tier's cap.
- The refusal itself is recorded as a usage_event with `status='quota_exceeded'`
  (matches spec 003's pattern).

## Implementation status — 2026-06-02

### v0.1 — SHIPPED (admin config)

| Item | Where |
|---|---|
| `tool_providers` / `tool_quotas` / `tool_usage_events` schema | `services/atlas-auth-api/src/db/schema.sql` |
| `pgcrypto` extension enabled; key encrypted at rest | same |
| Provider templates (5: Brave / Tavily / Serper / Firecrawl / Custom HTTP) | `src/admin/tool-providers.ts::PROVIDER_TEMPLATES` |
| Queries: list / get / upsert / delete / decrypt-for-runtime | `src/admin/tool-providers.ts` |
| Quota queries: list / patch-per-tier | same |
| Admin endpoints `/admin/v1/tool-providers/*` + `/admin/v1/tool-quotas/*` | `src/admin/routes.ts` |
| Admin "Tools" tab with table, edit form, template picker, quota matrix | `src/admin/page.ts` |
| `TOOL_KEY_ENCRYPTION_PASSPHRASE` env var | `.dev.vars.example` + `server-node.ts` + `app.ts` |
| 11/11 integration checks: encryption, masked read, preserve-on-no-key, custom_http, quota seed + patch, delete, invalid type rejection | smoke test |

### v0.2 — NOT YET SHIPPED (runtime + MCP)

The admin can configure providers, but the agent can't call them yet.
Next session:

- [ ] T201 Public Bearer-authed endpoint `POST /v1/tools/web/search`
- [ ] T202 Public Bearer-authed endpoint `POST /v1/tools/web/scrape`
- [ ] T203 Per-tier quota preflight (mirror of spec 003 `preflight()`)
- [ ] T204 Provider adapters: brave / tavily / serper / firecrawl
- [ ] T205 Generic `custom_http` adapter using `base_url` + `auth_scheme`
- [ ] T206 New MCP extension `atlas-web-tools` shipped with the desktop;
       registers `web_search`, `web_scrape`, `read_url` tools
- [ ] T207 Wire `atlas-web-tools` into goosed's extension manager so
       the agent sees the tools
- [ ] T208 Update spec 022's seeded "Web Research" skill's
       `manifest.extensions` to reference `@atlas/web-tools` so the
       SKILL.md procedural knowledge actually has the tool to call
- [ ] T209 Record `tool_usage_events` with `cost_usd` per call
- [ ] T210 Admin views: per-provider invocations, per-user usage,
       cost-by-day (mirrors spec 022 v0.5 skills views)

### v0.3 — Per-user BYOK override (deferred)

Pro+ users can plug their own provider key to bypass Atlas quota
(Constitution Principle I friendly — their requests still go through
Atlas's proxy but their key, their rate, their bill). UI in
`Settings → Models → Web tools` on the desktop.

### v0.4 — Tier-based provider selection (deferred)

When `searches_per_day` is hit on a low-tier provider (e.g. Brave free),
auto-fail-over to a backup (e.g. Tavily) if configured. Or expose a
"primary / fallback" pair in the admin.

## Constitution touchpoints

- **Principle I — BYOK**: signed-out users never reach the
  `/v1/tools/*` endpoints. Their browsing tools (if any) come from
  their own MCP extensions. Constitution intact.
- **Principle V — hard caps** (NON-NEGOTIABLE): preflight quota at the
  endpoint level. Refuse before upstream call.
- **R-API-004 — token-leak-scan**: plaintext API keys MUST NOT appear
  in logs, errors, audit events, or HTTP responses. Encryption + UI
  masking + dedicated test in CI (v0.2).

## Invocation policy — how the agent decides to use web tools

Approved 2026-06-02. The agent does NOT search the web for every query.
Three tiers compose:

### Tier 1 — Tool availability + LLM judgement (default)

The `atlas-web-tools` MCP extension registers `web_search`,
`web_scrape`, `read_url`. The model decides per-message whether the
question needs them.

- "what's 2+2" → no call
- "summarize the docs at https://x.com/y" → `read_url`
- "latest Anthropic pricing" → `web_search`
- "review my code" → no call

This matches Claude.ai / Cursor / Cline behaviour. Spending only happens
when fresh / external info is actually needed.

### Tier 2 — Skill-triggered (more deliberate)

The seeded "Web Research" skill's `when_to_use` instructs the agent
when to reach for the tools. SKILL.md content (v0.3 prose) will read:

> Use web tools ONLY when:
> - the user asks for current/recent info the model can't know
> - the user provides a URL to read or scrape
> - the user asks for citations or sources
> - the user explicitly asks to search
>
> DO NOT search for general knowledge already in the model's training
> set. DO NOT search for code/syntax questions, math, or definitions.

The skill is installed by default for all signed-in users.

### Tier 3 — User-forced (escape hatch)

User types "search the web for X" / "@web …" / "find me sources on Y"
→ always invokes the tool regardless of the agent's judgement.

### Hard caps remain (Principle V)

Even with disciplined invocation, the per-tier daily quota refuses
past the cap. Over-calling fails closed.

### User control

`Settings → Web tools` on the desktop will expose:

- **Auto** (default) — tiers 1+2+3 active
- **On request only** — tier 3 only (privacy mode, no auto-search)
- **Off** — extension disabled entirely

### Why not auto-search every query

- **Cost**: Brave ≈ $3 / 1k, Tavily ≈ $8 / 1k — auto-searching every
  "hi" burns the quota in days.
- **Latency**: adds 1-3 s to every response.
- **Privacy**: sends queries to a third-party search engine even when
  the model doesn't need it.
- **Noise**: irrelevant search hits derail answers
  ("what's a closure in JS" doesn't need today's news).

## Open questions

1. Default fallback when no provider configured: error 503, or fall
   back to "search via the model's training knowledge"?
2. Caching layer (Redis) in front of upstream to dedupe identical
   queries within 60s? Saves cost on repeated queries, complicates
   privacy.
3. Bring-Your-Own-Key vs Atlas-managed: should we let users see the
   cost of their own queries even when Atlas pays?
4. Per-provider scoring / preferences (admin says "for Pro tier,
   prefer Tavily over Brave")?

## Org-level scope (forward reference)

The `tool_usage_events` table currently logs **per-user** only:
`user_id`, `tool_name`, `provider`, `input_size`, `output_size`,
`cost_usd`, `status`, `occurred_at`, `context` JSONB.

[Spec 050 — Teams & Organization Licensing](../050-teams-licensing/spec.md)
adds a denormalised `organization_id` column so the same events can be
aggregated at user OR org grain without joins. v0.2 of THIS spec
(runtime + cost recording) should populate `organization_id` from the
JWT's `org` claim on every recorded event, even if spec 050 hasn't
shipped yet — keep the column nullable until 050 v0.1's migration runs.

This is what gives Darshan the data needed for the pricing /
licensing decisions ("can a Team plan afford X searches/month?").

## Files touched (v0.1)

```
services/atlas-auth-api/
  src/db/schema.sql                  +pgcrypto, +3 tables, +seed
  src/admin/tool-providers.ts        new — queries + templates
  src/admin/routes.ts                +7 endpoints
  src/admin/page.ts                  +Tools tab, +form, +quota matrix
  src/app.ts                         +TOOL_KEY_ENCRYPTION_PASSPHRASE in Env
  src/server-node.ts                 same
  .dev.vars.example                  new env var
```

## Acceptance criteria (v0.1 — all met)

- ✓ Admin can add Brave/Tavily/Serper/Firecrawl/custom providers via UI
- ✓ API keys stored encrypted; responses never leak plaintext
- ✓ Quotas seeded and editable per tier
- ✓ Custom HTTP option works (user-defined `base_url` + `auth_scheme`)
- ✓ Edit without re-entering API key preserves the stored key
- ✓ Encryption fails closed (503) when passphrase env is missing
