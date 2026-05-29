<!--
SYNC IMPACT REPORT
==================
Version change: (template) → 1.0.0
Bump rationale: Initial ratification — first concrete fill of the template.

Principles defined (new):
  I.   User Data Sovereignty (NON-NEGOTIABLE)
  II.  Inspectable Reasoning
  III. License Hygiene (NON-NEGOTIABLE)
  IV.  Cross-Platform Parity
  V.   Cost-Bounded by Default (NON-NEGOTIABLE)
  VI.  Specs Are Source of Truth

Sections defined:
  - Additional Constraints (Technology Stack, Security Requirements)
  - Development Workflow (Spec-Kit Loop, Pull Request Gates, Release Cadence)
  - Governance

Templates requiring updates:
  ⚠ .specify/templates/plan-template.md     — "Constitution Check" section needs explicit
                                                six-principle checklist; currently a stub.
  ⚠ .specify/templates/spec-template.md     — no constitution-tied requirements yet; revisit
                                                when first spec is authored.
  ⚠ .specify/templates/tasks-template.md    — task categorization to add: license-check task,
                                                cross-platform-parity task, audit-log task.
  ✅ CLAUDE.md                               — references constitution implicitly via plan link.

Deferred / follow-up:
  - TODO(plan-template): wire Constitution Check to six-principle gate after first /speckit-plan run.
  - TODO(tasks-template): add license-check / OS-parity / audit-log task categories.
  - Atlas codebase does not yet exist; principles apply forward to all future PRs.
-->

# Atlas Constitution

## Core Principles

### I. User Data Sovereignty (NON-NEGOTIABLE)

In BYOK and Local modes, user prompts, completions, and tool I/O MUST NOT transit Atlas infrastructure. The desktop client calls provider endpoints (Anthropic, OpenAI, Google, Ollama, etc.) directly. In Cloud mode, only the minimum data required to complete the request is processed by the Atlas proxy; no payload contents are logged beyond per-request metadata (timestamp, user ID, model name, token counts) unless the user has explicitly opted in to debug retention with an in-app toggle.

**Rationale**: Trust is the moat for a privately-distributed AI agent. A single privacy breach permanently destroys that trust, and the product with it.

### II. Inspectable Reasoning

Every agent action — LLM call, MCP tool invocation, filesystem write, network request — MUST be visible to the user in real time and replayable from a local audit log. No hidden background calls, no opaque tool chains, no "auto" modes that bypass the activity view. Logs are local-first and never transmitted off-device without explicit opt-in.

**Rationale**: Agents that act without showing their work get distrusted and uninstalled. Visibility is what distinguishes an agent from malware in the user's mental model.

### III. License Hygiene (NON-NEGOTIABLE)

All runtime and build dependencies MUST carry an Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause, MPL-2.0, ISC, or comparably permissive license. GPL, AGPL, SSPL, BUSL, and "source-available but non-commercial" licenses are forbidden in any code shipped to users. Every new-dependency PR MUST declare the dependency's license in the description; CI MUST fail if any lockfile or manifest references a denylisted license.

**Rationale**: Atlas is a closed-source commercial product. Copyleft contamination of a single transitive dependency can force-open the entire codebase.

### IV. Cross-Platform Parity

A user-facing feature MUST ship on macOS, Windows, and Linux in the same release, or it ships on none of them. Platform-specific implementation code is permitted (keychain APIs, signing, install flow) but the feature surface and behaviour are identical. CI MUST run the full test suite on all three OSes; a red build on any platform blocks the release.

**Rationale**: Atlas is positioned as a cross-platform product. Drift between platforms erodes the core promise and doubles support cost.

### V. Cost-Bounded by Default (NON-NEGOTIABLE)

In Cloud mode, every user account has a hard daily and monthly token-spend cap enforced by the proxy BEFORE any provider call is made. Caps MUST NOT be bypassable by client-side logic — only by the user explicitly upgrading their plan through the billing portal. Quota state lives on the proxy, never on the desktop. A user who exhausts quota receives a clear in-app message and a path to upgrade, never a silent failure and never a surprise bill.

**Rationale**: Per-user LLM spend without enforced bounds will bankrupt the business during beta. Hard caps before the provider call are the only safe default.

### VI. Specs Are Source of Truth

No code lands on `main` without a corresponding spec in `specs/NNN-<name>/`. No spec ships without code implementing it within the same release cycle. Pull requests that fail `/speckit-analyze` consistency checks (spec ↔ plan ↔ tasks ↔ code) MUST NOT merge. The constitution governs specs; specs govern plans; plans govern tasks; tasks govern code. No layer is skipped.

**Rationale**: A multi-disciplinary team (Rust core, frontend, backend, DevOps) building an AI agent across three OSes cannot stay aligned on tribal knowledge. The spec chain is the alignment artifact.

## Additional Constraints

### Technology Stack

- **Core agent engine**: Rust, inherited from upstream Goose. Forks of Goose internals are permitted only when an Atlas-specific change cannot be expressed as configuration or extension.
- **Desktop shell**: Whatever upstream Goose ships with (Electron at v1). A Tauri migration is evaluated only post-launch, only with measurable bundle-size or performance evidence.
- **Cloud services**: HTTP services, containerized, deployable to any modern PaaS (Cloudflare Workers / Fly.io / AWS Fargate). Language preference: Rust or TypeScript for stack cohesion.
- **Datastore**: PostgreSQL for transactional state. Adding a second datastore (e.g. ClickHouse for analytics) requires its own spec and constitutional review.

### Security Requirements

- All credentials — Atlas refresh tokens, user BYOK provider keys — MUST be stored in the OS-native secure store: macOS Keychain, Windows Credential Manager, libsecret on Linux. Plaintext storage in `~/.config/atlas/` or equivalent is forbidden.
- Atlas-issued tokens MUST be JWTs signed by a cloud KMS-managed key; verification keys distributed via a JWKS endpoint.
- Desktop ↔ cloud transport MUST be TLS 1.3+. Auth and proxy endpoint certificates MUST be pinned in the desktop client.
- Secrets MUST NOT appear in source control, CI logs, or telemetry payloads. CI MUST include a secret-scanner that fails the build on detection.

## Development Workflow

### Spec-Kit Loop

Every feature follows: `/speckit-constitution` (only when amending) → `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-checklist` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`.

Steps marked optional in upstream spec-kit (`clarify`, `checklist`, `analyze`) are MANDATORY for any spec that touches authentication, billing, persistent data, external network egress, or cryptographic material.

### Pull Request Gates

A PR MUST satisfy all of the following to merge:

1. CI green on macOS, Windows, and Linux.
2. License check passes (Principle III).
3. `/speckit-analyze` reports no SPEC ↔ PLAN ↔ TASKS ↔ CODE drift.
4. Linked `plan.md` contains a Constitution Check section that ticks each of the six principles with a one-line justification.
5. At least one reviewer from a sub-team different from the author's (frontend / backend / devops / Rust core) approves.

### Release Cadence

Weekly release train during beta and the first six months of GA. Hotfixes outside the train are permitted only for: data loss, security disclosure, or P0 outage. Every release MUST produce a tagged commit, signed installers for all three OSes, and release notes that reference the merged specs by ID.

## Governance

This constitution supersedes all individual preferences, prior team conventions, and defaults inherited from upstream Goose. Where this document conflicts with upstream Goose practice, this document wins.

**Amendment procedure**: a proposed change is filed as a PR modifying this file. The PR description MUST include written rationale and a migration plan covering all dependent templates (`plan-template.md`, `spec-template.md`, `tasks-template.md`) and any existing specs the change invalidates. Amendments require approval from the project owner (Darshan) plus one engineering lead.

**Versioning**: `CONSTITUTION_VERSION` is bumped per semver:

- **MAJOR**: a principle is removed or redefined in a backward-incompatible way.
- **MINOR**: a principle or section is added, or guidance is materially expanded.
- **PATCH**: clarifications, wording, typo fixes, or non-semantic refinements.

**Compliance verification** occurs at three gates:

1. `/speckit-plan` produces a Constitution Check that ticks every principle.
2. `/speckit-analyze` flags violations before `/speckit-implement` runs.
3. PR review confirms the above and applies the gates in *Pull Request Gates*.

Runtime developer guidance for AI-agent collaborators lives in `CLAUDE.md`. Spec-kit templates under `.specify/templates/` are the operational reflection of this constitution — any update here MUST propagate there in the same PR.

**Version**: 1.0.0 | **Ratified**: 2026-05-28 | **Last Amended**: 2026-05-28
