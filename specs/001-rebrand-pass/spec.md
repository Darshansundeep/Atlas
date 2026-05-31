# Feature Specification: Atlas Rebrand of Upstream Goose

**Feature Branch**: `001-rebrand-pass`

**Created**: 2026-05-28

**Status**: ~85% shipped (see "Implementation status" below)

## Implementation status — 2026-05-31 end-of-day

| Done | Pending |
|---|---|
| Atlas branding on every visible surface (Atlas account card, sign-in, Hub, sidebar wordmark, About attribution) | T015 — binary rename in CI |
| `atlas://` URL scheme registered + deep-link wired to renderer | T018-T019 — Rust path migration (some places still write `~/.local/share/goose/`) |
| `ai.netgroup.atlas` bundle id; Atlas-keyed safeStorage; `auth.json` under userData/Atlas | Keychain namespace migration — macOS still prompts for legacy "goose" entries on first launch |
| Apache 2.0 LICENSE + NOTICE-ATLAS bundled inside .app | T021-T023 — splash/installer assets still use legacy silhouette (commissioned logo will land in v2) |
| FEATURES flag system; 5 hidden capabilities (recipes/apps/scheduler/extensions/skills) at v1 | Phase 7 — Windows + Linux runtime verification (only macOS tested end-to-end) |
| Atlas-styled forge.config.ts (deb/rpm/flatpak naming, `ai.netgroup.atlas` Flatpak id) | |
| Brand-allow lint directive system + brand-guard CI checks | |
| Cash Sans CDN URL removed (see spec 023) | |

**Recommended pick-up tomorrow**: [`../ROADMAP.md`](../ROADMAP.md) item #2 — keychain + sessions-path migration. That closes the most-visible remaining artifact (the legacy "goose" keychain prompt on first macOS launch).

**Input**: User description: "Rebrand the upstream Goose desktop application as 'Atlas', a NET Group product, while keeping its behaviour functionally identical to upstream Goose. The rebrand replaces all product identity: binary name, application bundle identifier, platform config directory paths, environment variable prefix, custom URL scheme used for auth callbacks, HTTP user-agent strings sent to LLM providers, in-app strings, telemetry endpoints, and the application icon set / splash / tray icon / brand colour palette. Apache 2.0 LICENSE and NOTICE files from upstream Goose MUST be preserved and the in-app About screen MUST credit upstream Goose. The rebrand must apply uniformly to macOS, Windows, and Linux builds. Functionally the app remains indistinguishable from upstream Goose. A signed-in user from an upstream Goose install would NOT have their state migrated automatically. Success: an engineer can clone the Atlas repo and produce signed installer artifacts for all three OSes via CI with the Atlas identity throughout; no upstream string 'Goose' appears in any user-facing UI element except inside the About screen attribution paragraph; CI's full test suite passes on all three OSes; the About screen renders correctly on all three OSes showing both Atlas branding and Goose attribution."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — End user sees only the Atlas brand (Priority: P1)

A first-time end user downloads the Atlas installer, runs it on their macOS, Windows, or Linux machine, and uses the application for an entire session. Throughout install, first-run, and ordinary use, every user-visible surface — installer dialogs, app icon, dock/taskbar entry, window titles, menus, settings, notifications, system tray — presents the Atlas brand identity. The only place upstream Goose appears is the About screen, where Atlas explicitly credits it.

**Why this priority**: Without this, Atlas is indistinguishable from upstream Goose and the product does not exist. Brand identity is the entire deliverable of this feature.

**Independent Test**: Install Atlas on a fresh VM for each of the three OSes. Screenshot every visible screen during a representative session (install → first run → switch model → run a task → open settings → check tray icon → quit). Programmatic and human review confirms zero occurrences of the string "Goose" (case-insensitive) outside the About screen attribution paragraph.

**Acceptance Scenarios**:

1. **Given** a fresh macOS / Windows / Linux machine with no prior installation, **When** the user installs Atlas and opens the application, **Then** the dock/taskbar/launcher entry, window title, and application menu all display "Atlas" and the Atlas icon.
2. **Given** Atlas is running, **When** the user opens the About screen, **Then** Atlas branding appears prominently and a clearly visible attribution paragraph credits upstream Goose with a hyperlink to the upstream project.
3. **Given** Atlas is running, **When** the user opens settings, model picker, or any other in-app surface, **Then** no string referring to "Goose" appears outside the About screen.

---

### User Story 2 — Engineer produces signed Atlas installers from a single tagged commit (Priority: P1)

A build engineer tags a commit on the Atlas repository and runs the release pipeline. CI produces, on the same run, a notarized macOS `.dmg`, a signed Windows installer (`.msi` and/or `.exe`), and Linux artifacts (`.deb`, `.rpm`, and `AppImage`). All installer metadata (file properties, bundle identifier, code-signing subject) identifies the product as Atlas by NET Group. The full automated test suite runs and passes on each of the three OSes before any artifact is published.

**Why this priority**: Without a build pipeline that produces correctly-identified, signed artifacts, the brand identity cannot reach users. This story is the delivery mechanism for User Story 1.

**Independent Test**: Tag a test release on the rebrand branch. Verify CI produces all expected artifacts. For each artifact: inspect installer metadata (e.g., `pkgutil`, `Get-AuthenticodeSignature`, `dpkg-deb -I`) and confirm bundle identifier, signing identity, and publisher fields show Atlas / NET Group.

**Acceptance Scenarios**:

1. **Given** the Atlas repository is at the rebrand commit, **When** CI runs the release workflow, **Then** signed installer artifacts are produced for macOS, Windows, and Linux in a single run.
2. **Given** the macOS `.dmg` is built, **When** it is inspected with notarization tooling, **Then** notarization succeeds and the bundle identifier resolves to `ai.netgroup.atlas`.
3. **Given** the Windows installer is built, **When** its Authenticode signature is verified, **Then** the publisher field shows the NET Group identity.
4. **Given** the full automated test suite from upstream Goose, **When** it is executed against the Atlas fork on each of the three OSes, **Then** all tests pass.

---

### User Story 3 — Compliance reviewer verifies upstream attribution (Priority: P2)

A compliance / legal reviewer inspects an installed Atlas application to confirm that NET Group is honouring the upstream Apache 2.0 obligations. Within two minutes, they locate the verbatim `LICENSE` and `NOTICE` files from upstream Goose in the application's resource directory and see the Goose attribution rendered in the About screen.

**Why this priority**: Apache 2.0 attribution is a legal obligation; failure invalidates the right to redistribute. Lower priority than P1 only because the upstream `LICENSE` / `NOTICE` files are typically preserved by default unless actively removed, and the legal risk is correctable post-launch.

**Independent Test**: Install Atlas on any one OS. Open the About screen and find the attribution. Locate the bundled `LICENSE` and `NOTICE` files in the install directory. Confirm both files match upstream Goose verbatim.

**Acceptance Scenarios**:

1. **Given** an installed Atlas application, **When** the reviewer opens the About screen, **Then** an attribution paragraph credits upstream Goose with a hyperlink to its repository.
2. **Given** an installed Atlas application, **When** the reviewer inspects the application's bundled resources, **Then** the upstream `LICENSE` and `NOTICE` files are present and unmodified relative to upstream Goose at the forked version.

---

### Edge Cases

- A user who already has an upstream Goose install on the same machine installs Atlas. Both applications coexist without either modifying or reading the other's config, cache, logs, keychain entries, or URL-scheme registration.
- A user uninstalls Atlas. Atlas-namespaced files are cleanly removed; no Goose state is touched.
- A previously-running upstream Goose process and a freshly-launched Atlas process operate concurrently without contention over OS resources (keychain access, ports, lockfiles, URL handlers).
- The user clicks an `atlas://` deep link while Atlas is not running. The OS launches Atlas (not Goose) and routes the URL.
- The user clicks a `goose://` deep link with Atlas installed but no Goose installed. Atlas MUST NOT intercept it (Atlas is not registered for that scheme).
- A future Atlas release upgrades the user. Config paths remain stable across the upgrade so user state persists.
- The OS displays the Atlas icon in tray / menubar / launcher at native resolution on each platform (Retina on macOS, high-DPI on Windows, scaled on Linux) without pixelation or fallback to the default icon.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST present "Atlas" as its display name in every user-facing surface, including but not limited to installer dialogs, the dock / taskbar / launcher entry, window titles, the application menu, system notifications, the tray / menubar icon tooltip, and settings.
- **FR-002**: The application bundle identifier MUST be `ai.netgroup.atlas` on macOS, the AppUserModelID and registry publisher key MUST identify Atlas / NET Group on Windows, and the desktop entry name MUST be `atlas` on Linux.
- **FR-003**: All persistent application state (configuration, caches, logs, model history) MUST be stored under an Atlas-namespaced path on each OS, fully isolated from any concurrent upstream Goose installation.
- **FR-004**: All environment variables consumed by Atlas MUST use the `ATLAS_` prefix. Legacy `GOOSE_*` environment variables MUST NOT influence Atlas behaviour.
- **FR-005**: The custom URL scheme registered to Atlas MUST be `atlas://`, owned exclusively by the Atlas bundle. Atlas MUST NOT register or claim `goose://`.
- **FR-006**: All outbound HTTP user-agent strings sent by Atlas (to LLM providers, update servers, telemetry endpoints) MUST identify the client as Atlas / NET Group.
- **FR-007**: The application icon, splash screen, tray / menubar icon, and brand colour palette MUST present Atlas identity at native resolution on each of the three OSes.
- **FR-008**: The upstream Apache 2.0 `LICENSE` file MUST be preserved verbatim and accessible from the installed application's resources directory.
- **FR-009**: The upstream `NOTICE` file MUST be preserved verbatim alongside `LICENSE`.
- **FR-010**: The in-app About screen MUST display Atlas branding AND include an attribution paragraph crediting upstream Goose with a hyperlink to the upstream project.
- **FR-011**: Atlas MUST function on macOS, Windows, and Linux with feature parity. No rebrand-introduced behavioural differences are permitted between OSes (per Constitution Principle IV).
- **FR-012**: The agent loop, LLM provider integrations, MCP extension framework, and settings semantics MUST remain functionally identical to upstream Goose at the forked version. The rebrand changes identity, not behaviour.
- **FR-013**: Atlas MUST NOT automatically migrate, copy, or read state from any pre-existing upstream Goose installation. Atlas is a clean-install product from the user's perspective.
- **FR-014**: Signed installer artifacts MUST be producible from a single tagged commit for macOS (notarized `.dmg`), Windows (`.msi` and/or `.exe` with EV-signed binary), and Linux (`.deb`, `.rpm`, and `AppImage`).
- **FR-015**: The full upstream Goose automated test suite, plus any Atlas-added rebrand-verification tests, MUST execute on all three OSes in CI and report green before any release artifact is published.
- **FR-016**: No literal occurrence of "goose" (case-insensitive) MAY appear in any user-facing surface except (a) the About-screen attribution paragraph, (b) the bundled `LICENSE` text, and (c) the bundled `NOTICE` text.

- **FR-017**: Atlas v1 MUST present a **Claude-Code-style minimal default surface** in the navigation panel: New Chat, Session History, Settings only. Advanced upstream-Goose capabilities (Recipes, Skills, Apps, Scheduler, Extensions) MUST be **shipped-but-hidden by default**, gated by boolean flags in a `FEATURES` object in `ui/desktop/src/branding/index.ts`. Each capability can be re-enabled per release by flipping its flag to `true` — no code change to the nav component required. Hidden routes MAY remain reachable by direct URL (so future spec `021-admin-console` can push per-org overrides) but MUST NOT appear in the visible navigation when their flag is false.

- **FR-018**: The Atlas brand mark (A+globe+ring on navy) MUST appear in place of the upstream Goose bird icon in every user-facing surface: chat header, sidebar logo, onboarding screen, About panel. The image is sourced from `ui/desktop/src/images/icon-512.png` (produced by `tools/scripts/build-icons.py`) and consumed via the existing `Goose` React component — which renders an `<img>` of the Atlas mark instead of the bird SVG. The React component's identifier remains `Goose` to minimize upstream-merge surface; only the rendered output is rebranded.

### Key Entities

- **Product Identity**: The bundle of brand attributes that distinguishes Atlas from upstream Goose — display name, bundle identifier, application icons, URL scheme, environment variable prefix, configuration path namespace, HTTP user-agent string, and brand colour palette. This entity is what the rebrand creates.
- **Attribution Surface**: The set of locations inside the installed product (About screen, bundled `LICENSE`, bundled `NOTICE`) where upstream Goose credit appears. This entity is what discharges the Apache 2.0 obligation.
- **Build Artifact**: A signed, distributable installer (macOS `.dmg`, Windows installer, Linux package) produced by CI from a tagged commit. The set of artifacts produced from a single tag MUST be identifiable as a coherent Atlas release across all three OSes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On each of the three supported OSes, an automated UI traversal of every screen (install, first-run, main view, settings, model picker, About) records zero occurrences of "Goose" (case-insensitive) outside the About screen's attribution paragraph and the bundled LICENSE/NOTICE files.
- **SC-002**: A single tagged commit on the rebrand branch produces, in one CI run, signed installer artifacts for macOS, Windows, and Linux, each with installer metadata identifying Atlas / NET Group as the product / publisher.
- **SC-003**: 100% of the upstream Goose automated test suite passes when executed against the Atlas fork on each of the three OSes, demonstrating functional parity.
- **SC-004**: A compliance reviewer can locate the bundled `LICENSE` and `NOTICE` files and verify they match upstream Goose verbatim within 2 minutes of opening the installed application.
- **SC-005**: A user with both upstream Goose and Atlas installed can use either application across multiple sessions without observing any state, configuration, or URL-handler interference between the two.
- **SC-006**: A new user on any of the three supported OSes completes installation in under 3 minutes with no user-visible Goose references during the installer flow.

## Assumptions

- Atlas is forked from a specific stable tag of upstream Goose. The exact upstream tag to fork from is chosen during planning (`/speckit-plan`), not in this spec.
- NET Group has obtained Apple Developer enrollment (Team ID), a Windows EV code-signing certificate, and an OpenPGP key for signing Linux packages, or has these in process before release. Absence of these credentials blocks SC-002 but is treated as a release-engineering prerequisite, not a deficiency in this spec.
- The Atlas marketing site, downloads page, software update feed, and support channels are out of scope of this spec and addressed by separate specs.
- Non-user-visible internal identifiers within the source code (function names, internal package names, code comments) MAY retain "goose" references where renaming them carries merge-conflict risk against upstream. Only user-facing identity is rebranded. The Constitution's User Data Sovereignty principle is not affected by internal naming.
- The Atlas brand assets (icons, splash, colour palette) follow NET Group's existing brand guidelines, sourced or commissioned through the design team as a parallel workstream. Asset production timeline is not modelled in this spec.
- The application's behavioural functionality (agent loop, provider integrations, MCP extensions, settings semantics) is unchanged in this spec. Any behavioural change is the subject of a separate spec.
- Upstream Goose updates published after the Atlas fork are integrated through a separate rebase/merge process not modelled here. This spec defines the steady state after the initial rebrand commit.
