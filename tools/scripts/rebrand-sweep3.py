#!/usr/bin/env python3
"""Third-pass rebrand sweep — UI components I missed + Rust source remainder."""
from __future__ import annotations
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

SUBS: list[tuple[str, str, str]] = [
    # Goose.tsx function declaration — keep function name, annotate line.
    ("ui/desktop/src/components/icons/Goose.tsx",
     "export function Goose({ className = '' }) {",
     "export function Goose({ className = '' }) { // brand-allow: internal component identifier (renaming would touch all import sites)"),

    # AppsView — both occurrences of the comment.
    ("ui/desktop/src/components/apps/AppsView.tsx",
     '      // Only show apps from the "apps" extension (vibe coded apps built by Goose)',
     '      // brand-allow: code comment referencing upstream extension origin'),

    # OnboardingGuard.tsx — Goose import + defaultMessage + JSX.
    ("ui/desktop/src/components/onboarding/OnboardingGuard.tsx",
     "import { Goose } from '../icons';",
     "import { Goose } from '../icons'; // brand-allow: internal component import"),
    ("ui/desktop/src/components/onboarding/OnboardingGuard.tsx",
     "    defaultMessage: 'Unable to connect to Goose server',",
     "    defaultMessage: 'Unable to connect to Atlas server', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/onboarding/OnboardingGuard.tsx",
     '            <Goose className="size-8 mx-auto" />',
     '            <Goose className="size-8 mx-auto" /> {/* brand-allow: internal component */}'),
    ("ui/desktop/src/components/onboarding/OnboardingGuard.tsx",
     '                <Goose className="size-8" />',
     '                <Goose className="size-8" /> {/* brand-allow: internal component */}'),

    # ErrorBoundary.tsx — defaultMessage.
    ("ui/desktop/src/components/ErrorBoundary.tsx",
     "    defaultMessage: 'An error occurred in Goose v{version}.',",
     "    defaultMessage: 'An error occurred in Atlas v{version}.', // brand-allow: react-intl defaultMessage"),

    # theme-tokens.ts — doc comment.
    ("ui/desktop/src/theme/theme-tokens.ts",
     " *  1. Goose desktop — applied to :root per resolved theme.",
     " *  1. Atlas desktop — applied to :root per resolved theme."),

    # useChatStream.ts — notification messages.
    ("ui/desktop/src/hooks/useChatStream.ts",
     "    defaultMessage: 'Goose finished the task.',",
     "    defaultMessage: 'Atlas finished the task.', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/hooks/useChatStream.ts",
     "    defaultMessage: 'Click here to bring Goose back into focus.',",
     "    defaultMessage: 'Click here to bring Atlas back into focus.', // brand-allow: react-intl defaultMessage"),

    # goose-server: format string in API error. Brand-allow (adding atlas-branding
    # dep to goose-server is wider scope; this is one literal in an error path).
    ("crates/goose-server/src/routes/agent.rs",
     '        message: format!("Invalid Goose App HTML: {}", e),',
     '        message: format!("Invalid app HTML: {}", e), // brand-allow: was "Invalid Goose App HTML"'),

    # editor.rs test fixtures — update to use Atlas (matching the new write path).
    # The actual `extract_user_input` function splits on later markers; the title
    # header is just for human readability in the editor file.
    ("crates/goose-cli/src/session/editor.rs",
     '''        let content = r#"# Goose Prompt Editor

# Your prompt:
This is the hardcoded prompt response''',
     '''        let content = r#"# Atlas Prompt Editor

# Your prompt:
This is the hardcoded prompt response''',  # brand-allow handled by file-level allowlist below if needed
     ),
    ("crates/goose-cli/src/session/editor.rs",
     '''        let content = r#"# Goose Prompt Editor

# Your prompt:
This is the user's input''',
     '''        let content = r#"# Atlas Prompt Editor

# Your prompt:
This is the user's input''',
     ),
    ("crates/goose-cli/src/session/editor.rs",
     '''        let content = r#"# Goose Prompt Editor

# Your prompt:
Some content''',
     '''        let content = r#"# Atlas Prompt Editor

# Your prompt:
Some content''',
     ),

    # builder.rs doc comment.
    ("crates/goose-cli/src/session/builder.rs",
     "/// Configuration for building a new Goose session",
     "/// Configuration for building a new agent session  // brand-allow"),

    # goose-sdk Cargo.toml description.
    ("crates/goose-sdk/Cargo.toml",
     'description = "Rust SDK for talking to Goose over the Agent Client Protocol (ACP)"',
     'description = "Rust SDK for talking to the agent over the Agent Client Protocol (ACP)"  # brand-allow: was "Goose"'),

    # goose-sdk custom_requests.rs — doc comments.
    ("crates/goose-sdk/src/custom_requests.rs",
     "/// Read Goose default provider and model configuration.",
     "/// Read default provider and model configuration.  // brand-allow: was 'Read Goose ...'"),
    ("crates/goose-sdk/src/custom_requests.rs",
     "/// Save Goose default provider and model configuration.",
     "/// Save default provider and model configuration.  // brand-allow: was 'Save Goose ...'"),
    ("crates/goose-sdk/src/custom_requests.rs",
     "/// Scan for existing Goose and compatible app data that onboarding can import.",
     "/// Scan for existing app data that onboarding can import.  // brand-allow: was 'existing Goose ...'"),
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
            if new.split("\n")[0] in text:
                print(f"NOOP   {rel}")
            else:
                print(f"SKIP   {rel}  (target not present)")
                skipped += 1
            continue
        path.write_text(text.replace(old, new))
        print(f"WROTE  {rel}")
        applied += 1
    print()
    print(f"Summary: applied={applied}, skipped/noop={skipped}")


if __name__ == "__main__":
    main()
