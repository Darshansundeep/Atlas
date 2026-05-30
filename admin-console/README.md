# Atlas Admin Console — placeholder

This directory is a **UI placeholder** for the future Atlas admin console, formally specified in `specs/021-admin-console/` (not yet drafted; deferred per `ATLAS_BUILD_PLAN.md` post-launch capabilities).

## What's here

- `index.html` — static HTML mockup of the branding settings form. Open it in any browser:

  ```bash
  open admin-console/index.html        # macOS
  xdg-open admin-console/index.html    # Linux
  start admin-console/index.html       # Windows
  ```

- Fields: app name, logo upload, primary colour. Changing them updates an in-page preview only. The **Save** button is intentionally disabled — nothing persists, no backend exists yet.

## What it's NOT

- Not a real admin console.
- Not wired to the desktop app at runtime. The desktop reads from `ui/desktop/src/branding/runtime.ts` → `getEffectiveBranding()`, which today returns compile-time defaults from `ui/desktop/src/branding/index.ts`.
- Not auth-gated. The real console will be auth-gated via `002-cloud-auth` flow.
- Not multi-page. The real console will have Skills, Governance, Users, Audit Log, Billing — see `ATLAS_BUILD_PLAN.md` §"Deferred — Post-launch capabilities".

## How it connects to the runtime branding overlay

The desktop app already has a `BrandingConfig` runtime layer (`ui/desktop/src/branding/runtime.ts`). It is the contract the future admin console will push through:

```
┌────────────────────────────────────┐         ┌──────────────────────────────────┐
│  admin-console (web)               │  POST   │  api.atlas.netgroup.ai/v1/branding│
│  - org admin uploads logo + name   │ ──────► │  - persists per-org BrandingConfig│
└────────────────────────────────────┘         └──────────────────┬───────────────┘
                                                                  │ GET on launch
                                                                  ▼
                                                ┌─────────────────────────────────┐
                                                │  Atlas Desktop (per user)       │
                                                │  branding/runtime.ts:           │
                                                │    fetchRemoteBranding()        │
                                                │    → cachedOverride             │
                                                │    → getEffectiveBranding()     │
                                                └─────────────────────────────────┘
```

Until specs 002 and 021 ship:
- `fetchRemoteBranding()` returns `null`.
- `getEffectiveBranding()` returns `IDENTITY` defaults.
- This admin-console placeholder demonstrates the *intent* of the UI without requiring the backend.

## When this becomes real (spec 021-admin-console)

Replace this static HTML with a proper web app (Next.js / Vite + React most likely), wire it to the `api.atlas.netgroup.ai` backend, add auth via WorkOS/Clerk per spec `002-cloud-auth`, and move it into its own repo. At that point this directory either becomes the demo/storybook for the real app, or is deleted in favour of a `docs/admin-console.md` pointer.
