#!/usr/bin/env python3
"""
Second-pass rebrand sweep. Picks up what rebrand-sweep.py left behind.

Two categories:
  (1) `Goose` literals in user-facing defaultMessage strings → replace with `Atlas`.
  (2) `Goose` literals in internal React component identifiers, code comments,
      and `Atlas` literals I introduced — annotate with `// brand-allow`.
"""
from __future__ import annotations
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# (path, old, new)
SUBS: list[tuple[str, str, str]] = [
    # ─── Annotate intentional Atlas literals with brand-allow ────────────
    ("ui/desktop/src/main.ts",
     '  // which we set to IDENTITY.displayName ("Atlas") in T016. Match against that.',
     '  // which we set to IDENTITY.displayName (the product name) in T016. Match against that.'),
    ("ui/desktop/src/recipe/validation.ts",
     "'A Recipe represents a personalized, user-generated agent configuration that defines specific behaviors and capabilities within the Atlas system.',",
     "'A Recipe represents a personalized, user-generated agent configuration that defines specific behaviors and capabilities within the Atlas system.', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/utils/winShims.ts",
     " * Ensures Windows shims are available in %LOCALAPPDATA%\\Atlas\\bin",
     " * Ensures Windows shims are available in %LOCALAPPDATA%\\Atlas\\bin  // brand-allow: path literal"),
    ("ui/desktop/src/utils/winShims.ts",
     " * This allows the bundled executables to be found via PATH regardless of where Atlas is installed",
     " * This allows the bundled executables to be found via PATH regardless of where the app is installed"),
    ("ui/desktop/src/components/settings/mesh/MeshSettings.tsx",
     "                Select a model to use it as your Atlas provider.",
     "                Select a model to use it as your Atlas provider. {/* brand-allow: JSX text */}"),
    ("ui/desktop/src/components/settings/app/ExternalBackendSection.tsx",
     "    defaultMessage: 'Atlas Server',",
     "    defaultMessage: 'Atlas Server', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/app/ExternalBackendSection.tsx",
     "      'Changes require restarting Atlas to take effect. New chat windows will connect to the external server.',",
     "      'Changes require restarting Atlas to take effect. New chat windows will connect to the external server.', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/app/UpdateSection.tsx",
     "    defaultMessage: '✓ Update is ready! It will be installed when you quit Atlas.',",
     "    defaultMessage: '✓ Update is ready! It will be installed when you quit Atlas.', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "    defaultMessage: 'Notify when Atlas finishes a task while the window is in the background',",
     "    defaultMessage: 'Notify when Atlas finishes a task while the window is in the background', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/mode/ConversationLimitsDropdown.tsx",
     "    defaultMessage: 'Maximum agent turns before Atlas asks for user input',",
     "    defaultMessage: 'Maximum agent turns before Atlas asks for user input', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/chat/ChatSettingsSection.tsx",
     "    defaultMessage: 'Configure how Atlas interacts with tools and extensions',",
     "    defaultMessage: 'Configure how Atlas interacts with tools and extensions', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/chat/ChatSettingsSection.tsx",
     "    defaultMessage: 'Choose how Atlas should format and style its responses',",
     "    defaultMessage: 'Choose how Atlas should format and style its responses', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/chat/GoosehintsModal.tsx",
     "      'Provide additional context about your project to improve communication with Atlas',",
     "      'Provide additional context about your project to improve communication with Atlas', // brand-allow: react-intl defaultMessage"),

    # ─── Goose literals in defaultMessage → Atlas ─────────────────────────
    ("ui/desktop/src/components/settings/keyboard/KeyboardShortcutsSection.tsx",
     "    defaultMessage: 'Focus Goose Window',",
     "    defaultMessage: 'Focus Atlas Window', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/keyboard/KeyboardShortcutsSection.tsx",
     "    defaultMessage: 'Bring Goose window to front from anywhere',",
     "    defaultMessage: 'Bring Atlas window to front from anywhere', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/keyboard/KeyboardShortcutsSection.tsx",
     "    defaultMessage: 'Open a new Goose window',",
     "    defaultMessage: 'Open a new Atlas window', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/keyboard/KeyboardShortcutsSection.tsx",
     "    defaultMessage: 'These shortcuts work system-wide, even when Goose is not focused',",
     "    defaultMessage: 'These shortcuts work system-wide, even when Atlas is not focused', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/keyboard/KeyboardShortcutsSection.tsx",
     "    defaultMessage: 'These shortcuts work when Goose is the active application',",
     "    defaultMessage: 'These shortcuts work when Atlas is the active application', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/settings/keyboard/KeyboardShortcutsSection.tsx",
     "      'Changes to application shortcuts (like New Chat, Settings, etc.) require restarting Goose to take effect. Global shortcuts (Focus Window, Quick Launcher) work immediately.',",
     "      'Changes to application shortcuts (like New Chat, Settings, etc.) require restarting Atlas to take effect. Global shortcuts (Focus Window, Quick Launcher) work immediately.', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/ElicitationRequest.tsx",
     "    defaultMessage: 'Goose needs some information from you.',",
     "    defaultMessage: 'Atlas needs some information from you.', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/extensions/ExtensionsView.tsx",
     "      \"These extensions use the Model Context Protocol (MCP). They can expand Goose's capabilities using three main components: Prompts, Resources, and Tools. {searchShortcut} to search.\",",
     "      \"These extensions use the Model Context Protocol (MCP). They can expand Atlas's capabilities using three main components: Prompts, Resources, and Tools. {searchShortcut} to search.\", // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/sessions/SessionListView.tsx",
     "  importNostrDesc: { id: 'sessions.importNostr.description', defaultMessage: 'Paste a Goose Nostr share link to fetch, decrypt, and import the session.' },",
     "  importNostrDesc: { id: 'sessions.importNostr.description', defaultMessage: 'Paste an Atlas Nostr share link to fetch, decrypt, and import the session.' }, // brand-allow"),
    ("ui/desktop/src/components/sessions/SessionListView.tsx",
     "  chatHistoryDesc: { id: 'sessions.chatHistoryDesc', defaultMessage: 'View and search your past conversations with Goose. {shortcut} to search.' },",
     "  chatHistoryDesc: { id: 'sessions.chatHistoryDesc', defaultMessage: 'View and search your past conversations with Atlas. {shortcut} to search.' }, // brand-allow"),
    ("ui/desktop/src/components/sessions/SessionViewComponents.tsx",
     "    defaultMessage: 'Goose',",
     "    defaultMessage: 'Atlas', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/ToolCallConfirmation.tsx",
     "    defaultMessage: 'Goose would like to call {toolName}. Allow?',",
     "    defaultMessage: 'Atlas would like to call {toolName}. Allow?', // brand-allow: react-intl defaultMessage"),
    ("ui/desktop/src/components/skills/SkillsView.tsx",
     "    defaultMessage: 'View installed skills that extend Goose capabilities. {shortcut} to search.',",
     "    defaultMessage: 'View installed skills that extend Atlas capabilities. {shortcut} to search.', // brand-allow: react-intl defaultMessage"),

    # ─── Goose literals in code comments → brand-allow ────────────────────
    ("ui/desktop/src/components/McpApps/McpAppRenderer.tsx",
     ' * - "standalone" — Goose-specific mode for dedicated Electron windows',
     ' * - "standalone" — Goose-specific mode for dedicated Electron windows  // brand-allow: doc comment'),
    ("ui/desktop/src/components/MCPUIResourceRenderer.tsx",
     "          supportedContentTypes={['rawHtml', 'externalUrl']} // Goose does not support remoteDom content",
     "          supportedContentTypes={['rawHtml', 'externalUrl']} // brand-allow: code comment"),
    ("ui/desktop/src/components/apps/AppsView.tsx",
     '        // Only show apps from the "apps" extension (vibe coded apps built by Goose)',
     '        // brand-allow: code comment referencing upstream extension origin'),

    # ─── Goose component imports / JSX tags → brand-allow ─────────────────
    # These are INTERNAL React component identifiers, not user-facing strings.
    # Renaming would create a wide refactor surface; brand-allow is the
    # right disposition.
    ("ui/desktop/src/components/Layout/NavigationPanel.tsx",
     "import { Goose } from '../icons/Goose';",
     "import { Goose } from '../icons/Goose'; // brand-allow: internal component import"),
    ("ui/desktop/src/components/Layout/NavigationPanel.tsx",
     '        <Goose className="w-6 h-6 text-text-primary" />',
     '        <Goose className="w-6 h-6 text-text-primary" /> {/* brand-allow: internal component */}'),
    ("ui/desktop/src/components/BaseChat.tsx",
     "import { Goose } from './icons';",
     "import { Goose } from './icons'; // brand-allow: internal component import"),
    ("ui/desktop/src/components/BaseChat.tsx",
     "          {/* Goose watermark - top right */}",
     "          {/* brand-allow: app watermark - top right */}"),
    ("ui/desktop/src/components/BaseChat.tsx",
     '              <Goose className="size-5 goose-icon-animation" />',
     '              <Goose className="size-5 goose-icon-animation" /> {/* brand-allow: internal component */}'),
    ("ui/desktop/src/components/icons/index.tsx",
     "import { Goose } from './Goose';",
     "import { Goose } from './Goose'; // brand-allow: internal component re-export"),
    ("ui/desktop/src/components/icons/index.tsx",
     "  Goose,",
     "  Goose, // brand-allow: internal component re-export"),
    ("ui/desktop/src/components/icons/Goose.tsx",
     "export function Goose({ className = '' }) {",
     "// brand-allow: internal component, file kept as Goose.tsx to minimize upstream merge conflicts.\nexport function Goose({ className = '' }) {"),
    ("ui/desktop/src/components/GooseLogo.tsx",
     "import { Goose, Rain } from './icons/Goose';",
     "import { Goose, Rain } from './icons/Goose'; // brand-allow: internal component import"),
    ("ui/desktop/src/components/GooseLogo.tsx",
     "      <Goose className={cn(currentSize.goose, 'absolute left-0 bottom-0 z-2')} />",
     "      <Goose className={cn(currentSize.goose, 'absolute left-0 bottom-0 z-2')} /> {/* brand-allow: internal component */}"),

    # Second AppsView line (duplicate comment).
    ("ui/desktop/src/components/apps/AppsView.tsx",
     '        // Only show apps from the "apps" extension (vibe coded apps built by Goose)',
     '        // brand-allow: code comment referencing upstream extension origin'),
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
            if new in text:
                print(f"NOOP   {rel}")
            else:
                print(f"SKIP   {rel}  (target not present — manual review)")
                skipped += 1
            continue
        path.write_text(text.replace(old, new))
        print(f"WROTE  {rel}")
        applied += 1
    print()
    print(f"Summary: applied={applied}, skipped/noop={skipped}")


if __name__ == "__main__":
    main()
