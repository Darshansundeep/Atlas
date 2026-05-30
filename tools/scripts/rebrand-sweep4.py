#!/usr/bin/env python3
"""Fourth-pass sweep — goose core crate doc comments + remaining UI/SDK items.

Strategy:
  - Doc comments: REWRITE to remove "Goose" (use "the app" / "the agent" /
    "the framework") because trailing `// brand-allow` would pollute rustdoc
    output.
  - User-facing strings: REPLACE "Goose" → "Atlas" + // brand-allow.
  - HTTP header names + git commit author: brand-allow (contract values).
  - editor.rs:306 fixture: fix the missed substitution.
  - editor.rs:206,230 (now Atlas): brand-allow.
  - theme-tokens.ts:13: brand-allow.
"""
from __future__ import annotations
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

SUBS: list[tuple[str, str, str]] = [
    # ─── self-introduced Atlas literals: brand-allow ───────────────────
    ("ui/desktop/src/theme/theme-tokens.ts",
     " *  1. Atlas desktop — applied to :root per resolved theme.",
     " *  1. The desktop client — applied to :root per resolved theme. // brand-allow"),

    # editor.rs raw-string test fixtures (Atlas after our sweep).
    ("crates/goose-cli/src/session/editor.rs",
     '        let content = r#"# Atlas Prompt Editor\n\n# Your prompt:\nThis is the hardcoded prompt response',
     '        // brand-allow: Atlas literal in test fixture string\n        let content = r#"# Atlas Prompt Editor\n\n# Your prompt:\nThis is the hardcoded prompt response'),
    ("crates/goose-cli/src/session/editor.rs",
     '        let content = r#"# Atlas Prompt Editor\n\n# Your prompt:\nThis is the user\'s input',
     '        // brand-allow: Atlas literal in test fixture string\n        let content = r#"# Atlas Prompt Editor\n\n# Your prompt:\nThis is the user\'s input'),

    # editor.rs:306 — Goose still here (sweep3 missed; different surrounding content).
    ("crates/goose-cli/src/session/editor.rs",
     '# Goose Prompt Editor',
     '# Atlas Prompt Editor'),

    # ─── goose-sdk doc comments ────────────────────────────────────────
    ("crates/goose-sdk/src/custom_requests.rs",
     "/// Create a custom provider backed by Goose's declarative provider store.",
     "/// Create a custom provider backed by the agent's declarative provider store."),
    ("crates/goose-sdk/src/custom_requests.rs",
     "/// Update a custom provider backed by Goose's declarative provider store.",
     "/// Update a custom provider backed by the agent's declarative provider store."),
    ("crates/goose-sdk/src/custom_requests.rs",
     "/// Delete a custom provider from Goose's declarative provider store.",
     "/// Delete a custom provider from the agent's declarative provider store."),
    ("crates/goose-sdk/src/custom_requests.rs",
     "/// A source discovered by Goose. Filesystem sources use an on-disk path;",
     "/// A source discovered by the agent. Filesystem sources use an on-disk path;"),
    ("crates/goose-sdk/src/custom_requests.rs",
     "    /// Whether Goose has enough configuration to use this provider.",
     "    /// Whether the app has enough configuration to use this provider."),

    # ─── goose core crate: doc comments ────────────────────────────────
    ("crates/goose/src/oauth/persist.rs",
     "/// Goose-specific credential store that uses the Config system",
     "/// Agent-specific credential store that uses the Config system"),
    ("crates/goose/src/security/adversary_inspector.rs",
     "/// Activated by placing an `adversary.md` file in the Goose config directory",
     "/// Activated by placing an `adversary.md` file in the agent config directory"),
    ("crates/goose/src/providers/canonical/name_builder.rs",
     "        // Goose provider names that differ from models.dev names",
     "        // Provider names that differ from models.dev names. // brand-allow: was 'Goose provider names'"),
    ("crates/goose/src/agents/mcp_client.rs",
     "/// MCP client implementation for Goose",
     "/// MCP client implementation for the agent"),
    ("crates/goose/src/execution/mod.rs",
     "//! Unified execution management for Goose agents",
     "//! Unified execution management for agent execution"),
    ("crates/goose/src/hooks/mod.rs",
     '//! Goose currently supports `type: "command"` actions. Unknown event names and',
     '//! The hook system currently supports `type: "command"` actions. Unknown event names and'),
    ("crates/goose/src/instance_id.rs",
     "/// Returns a stable, globally unique identifier for this Goose installation.",
     "/// Returns a stable, globally unique identifier for this app installation."),
    ("crates/goose/src/acp/server.rs",
     "    // Goose stores updated_at with second precision in common write paths, so the",
     "    // The server stores updated_at with second precision in common write paths, so the"),
    ("crates/goose/src/gateway/telegram.rs",
     "    /// Files are stored under `<tmp>/goose_voice/voice_<uuid>.<ext>` so Goose",
     "    /// Files are stored under `<tmp>/goose_voice/voice_<uuid>.<ext>` so the agent  // brand-allow: filename prefix"),
    ("crates/goose/src/gateway/telegram.rs",
     "    /// Build the text prompt that tells Goose about a voice message file.",
     "    /// Build the text prompt that tells the agent about a voice message file."),
    ("crates/goose/src/gateway/telegram.rs",
     "                                // Goose to transcribe the file using CLI tools.",
     "                                // the agent to transcribe the file using CLI tools."),
    ("crates/goose/src/prompt_template.rs",
     '        "Prompt for generating new Goose apps based on the user instructions",',
     '        "Prompt for generating new agent apps based on the user instructions",'),
    ("crates/goose/src/prompt_template.rs",
     '        "Prompt for updating existing Goose apps based on feedback",',
     '        "Prompt for updating existing agent apps based on feedback",'),

    # ─── goose core crate: user-facing / LLM-prompt strings ────────────
    ("crates/goose/src/providers/kimicode.rs",
     '            "Once authorized, Goose will save your token automatically",',
     '            "Once authorized, the app will save your token automatically",'),
    ("crates/goose/src/providers/local_inference/llamacpp/mod.rs",
     "         Goose cannot safely infer the correct prompt format from architecture alone. Select a \\",
     "         The agent cannot safely infer the correct prompt format from architecture alone. Select a \\"),
    ("crates/goose/src/providers/local_inference/llamacpp/inference_emulated_tools.rs",
     '        "You are Goose, an AI assistant. You can execute shell commands by starting lines with $."',
     '        "You are Atlas, an AI assistant. You can execute shell commands by starting lines with $." // brand-allow: LLM system prompt'),

    # ─── goose core: provider catalog display names ───────────────────
    ("crates/goose/src/providers/catalog.rs",
     '        display_name: Some("Goose"),',
     '        display_name: Some("Atlas"), // brand-allow: catalog default display name'),
    ("crates/goose/src/providers/catalog.rs",
     '        display_name: curated.display_name.unwrap_or("Goose").to_string(),',
     '        display_name: curated.display_name.unwrap_or("Atlas").to_string(), // brand-allow: catalog fallback display name'),

    # ─── execute_commands.rs CLI tool description ─────────────────────
    ("crates/goose/src/agents/execute_commands.rs",
     '        description: "Check that your Goose setup is working",',
     '        description: "Check that your Atlas setup is working", // brand-allow: CLI tool description'),

    # ─── HTTP headers + test data: brand-allow (contract values) ──────
    ("crates/goose/src/agents/mcp_client.rs",
     '                "Goose-Session-Id": "old-session-id",',
     '                "Goose-Session-Id": "old-session-id", // brand-allow: upstream HTTP header contract'),

    # ─── git user.name in test/internal git operations ────────────────
    ("crates/goose/src/plugins/mod.rs",
     '        run_git(repo, &["config", "user.name", "Goose"]);',
     '        run_git(repo, &["config", "user.name", "Atlas"]);  // brand-allow: internal git commit author'),

    # ─── apps.rs LLM tool descriptions ────────────────────────────────
    ("crates/goose/src/agents/platform_extensions/apps.rs",
     '            "Generate content for a new Goose app. Returns the HTML code, app name, description, and window properties.".to_string(),',
     '            "Generate content for a new Atlas app. Returns the HTML code, app name, description, and window properties.".to_string(), // brand-allow'),
    ("crates/goose/src/agents/platform_extensions/apps.rs",
     '            "Generate updated content for an existing Goose app. Returns the improved HTML code, updated description, and optionally updated window properties.".to_string(),',
     '            "Generate updated content for an existing Atlas app. Returns the improved HTML code, updated description, and optionally updated window properties.".to_string(), // brand-allow'),
    ("crates/goose/src/agents/platform_extensions/apps.rs",
     '                "List all available Goose apps with their names and descriptions. Use this to see what apps exist before creating or modifying apps.".to_string(),',
     '                "List all available Atlas apps with their names and descriptions. Use this to see what apps exist before creating or modifying apps.".to_string(), // brand-allow'),
    ("crates/goose/src/agents/platform_extensions/apps.rs",
     '                "Create a new Goose app based on a description or PRD. The extension will use an LLM to generate the HTML/CSS/JavaScript. Apps are sandboxed and run in standalone windows.".to_string(),',
     '                "Create a new Atlas app based on a description or PRD. The extension will use an LLM to generate the HTML/CSS/JavaScript. Apps are sandboxed and run in standalone windows.".to_string(), // brand-allow'),
    ("crates/goose/src/agents/platform_extensions/mod.rs",
     '                    "Create and manage custom Goose apps through chat. Apps are HTML/CSS/JavaScript and run in sandboxed windows.",',
     '                    "Create and manage custom Atlas apps through chat. Apps are HTML/CSS/JavaScript and run in sandboxed windows.", // brand-allow'),
    ("crates/goose/src/agents/platform_extensions/mod.rs",
     '                    "Goose will make extension calls through code execution, saving tokens",',
     '                    "The agent will make extension calls through code execution, saving tokens",'),

    # ─── doctor.rs diagnostic banners ────────────────────────────────
    ("crates/goose/src/doctor.rs",
     '                "**Goose Doctor**\\n\\n{}\\n\\n\\',
     '                "**Atlas Doctor**\\n\\n{}\\n\\n\\  // brand-allow'),
    ("crates/goose/src/doctor.rs",
     '            "**Goose Doctor**\\n\\n{}\\n\\n\\',
     '            "**Atlas Doctor**\\n\\n{}\\n\\n\\  // brand-allow'),
    ("crates/goose/src/doctor.rs",
     '        "**Goose Doctor**\\n\\n{}\\n\\n\\',
     '        "**Atlas Doctor**\\n\\n{}\\n\\n\\  // brand-allow'),

    # ─── acp/server/onboarding.rs onboarding messages ────────────────
    ("crates/goose/src/acp/server/onboarding.rs",
     '        OnboardingImportSourceKind::GooseConfig => "Goose configuration",',
     '        OnboardingImportSourceKind::GooseConfig => "Legacy configuration", // brand-allow: GooseConfig enum variant kept as upstream API'),
    ("crates/goose/src/acp/server/onboarding.rs",
     '        warnings.push("Sessions are already shared through Goose\'s data store.".to_string());',
     '        warnings.push("Sessions are already shared through the app\'s data store.".to_string());'),
    ("crates/goose/src/acp/server/onboarding.rs",
     '        display_name: "Existing Goose configuration".to_string(),',
     '        display_name: "Existing legacy configuration".to_string(), // brand-allow'),
    ("crates/goose/src/acp/server/onboarding.rs",
     '        .push("Session history already lives in the Goose data store when available.".to_string());',
     '        .push("Session history already lives in the app data store when available.".to_string());'),

    # acp/server.rs default provider label.
    ("crates/goose/src/acp/server.rs",
     'const DEFAULT_PROVIDER_LABEL: &str = "Goose (Default)";',
     'const DEFAULT_PROVIDER_LABEL: &str = "Atlas (Default)"; // brand-allow'),

    # nostr_share.rs share link error messages.
    ("crates/goose/src/session/nostr_share.rs",
     '    let parsed = url::Url::parse(deeplink).context("Invalid Goose session share link")?;',
     '    let parsed = url::Url::parse(deeplink).context("Invalid session share link")?;'),
    ("crates/goose/src/session/nostr_share.rs",
     '        return Err(anyhow!("Invalid Goose Nostr session share link"));',
     '        return Err(anyhow!("Invalid Nostr session share link"));'),

    # sources.rs vendor name in test data.
    ("crates/goose/src/sources.rs",
     '            build_skill_md("shared-skill", "legacy", "Goose", &HashMap::new()),',
     '            build_skill_md("shared-skill", "legacy", "Atlas", &HashMap::new()),  // brand-allow: legacy vendor token'),
]


def main():
    applied = 0
    skipped = 0
    for rel, old, new in SUBS:
        path = REPO_ROOT / rel
        if not path.exists():
            print(f"SKIP   {rel}  (not found)")
            skipped += 1
            continue
        text = path.read_text()
        if old not in text:
            print(f"SKIP   {rel}  (target not present — already swept or upstream changed)")
            skipped += 1
            continue
        path.write_text(text.replace(old, new))
        print(f"WROTE  {rel}")
        applied += 1
    print()
    print(f"Summary: applied={applied}, skipped/noop={skipped}")


if __name__ == "__main__":
    main()
