# atlas-auth-api



Atlas cloud auth backend. Implements spec `002-cloud-auth`.

Issues access JWTs + rotating refresh tokens to the Atlas desktop app
after a user signs in via WorkOS AuthKit. Local dev runs on Node.js with
a stub IdP so contributors don't need a WorkOS account.

## Local dev

```bash
# 1. Postgres (Docker)
docker run -d --name atlas-auth-postgres \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=atlas_auth \
  -p 5432:5432 postgres:16

# 2. Install + configure
pnpm install
cp .dev.vars.example .dev.vars
# default values work for local dev (STUB_IDP=true)

# 3. Apply schema
pnpm run migrate

# 4. Run dev server
pnpm run dev
# → listening on http://127.0.0.1:8787  (STUB_IDP=true)
```

## Smoke test the flow (with STUB_IDP=true)

```bash
# Code grant (the "code" must be shaped dev-<email>)
curl -s http://127.0.0.1:8787/v1/auth/token \
  -H 'content-type: application/json' \
  -d '{
    "grant_type": "authorization_code",
    "code": "dev-darshan@netgroup.ai",
    "code_verifier": "any-128-char-string-for-stub-mode-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "redirect_uri": "atlas://auth"
  }' | jq .

# Save the response somewhere — you'll need the access_token + refresh_token.

# /v1/me with the access token
curl -s http://127.0.0.1:8787/v1/me \
  -H "authorization: Bearer $ACCESS" | jq .

# Refresh
curl -s http://127.0.0.1:8787/v1/auth/token \
  -H 'content-type: application/json' \
  -d "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$REFRESH\"}" | jq .

# Refresh-token-theft check: trying the OLD refresh token after a successful
# rotation must return 403 token_theft_suspected AND mark all sessions revoked.
```

## Production swap-in (when ready)

1. Provision a WorkOS organisation; configure AuthKit OAuth client with
   redirect URIs `atlas://auth` and `http://127.0.0.1:*/callback`.
2. Set `STUB_IDP=false`, `WORKOS_CLIENT_ID=...`, `WORKOS_API_KEY=...`.
3. Provision a Postgres database (Neon recommended) and set `DATABASE_URL`.
4. Set `JWT_SIGNING_SECRET` to a strong random value (rotate quarterly).
5. Deploy. The Hono app is runtime-portable — re-target to Cloudflare
   Workers by adding a `wrangler.toml` and a thin `worker.ts` that
   `export default { fetch: createApp(env).fetch }`.

## Endpoints

See `specs/002-cloud-auth/contracts/auth-backend-api.md` for the
authoritative shape. Briefly:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/auth/token` | none | code or refresh-token grant |
| POST | `/v1/auth/revoke` | none | sign-out (cascading) |
| GET  | `/v1/me` | Bearer | current user + tier |
| GET  | `/v1/subscription` | Bearer | tier + quota |
| GET  | `/healthz` | none | liveness |
| GET  | `/.well-known/jwks.json` | none | 404 at v1 (HS256) |
