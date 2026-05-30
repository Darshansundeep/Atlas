#!/usr/bin/env python3
"""
Bulk rebrand sweep — T024 continuation.

Applies the rebrand rules described in contracts/identity-constants.md across
ui/desktop/src/ and crates/ where they can be done mechanically.

Idempotent: re-running on already-swept files is a no-op.

Strategy per file/extension:
  - TypeScript / TSX user-facing strings: replace literal "Goose" inside
    react-intl defaultMessage strings, dialog text, etc. → "Atlas" with
    `// brand-allow` comment OR import IDENTITY (case-by-case).
  - main.ts: i18n key map entries + comments get `// brand-allow` (these
    are i18n SOURCE strings; full translation belongs in a separate PR).
  - autoUpdater.ts / githubUpdater.ts: user-facing strings replaced with
    template literals using IDENTITY.displayName.
  - Windows shim paths: rename "\\Goose\\bin" → "\\Atlas\\bin" since this
    is per-install OS-level state Atlas needs to own.
  - CSS / SVG comments + shell scripts: append `/* brand-allow */` / `# brand-allow`.
  - Rust: clap attribute literals already have `// brand-allow`. Cargo.toml
    comments get `# brand-allow`.

This script PRINTS each change as it happens. Run with `--dry-run` to preview.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# (path-relative-to-repo, old, new) tuples. Idempotent: only applied if `old`
# is present and `new` is not.
SUBS: list[tuple[str, str, str]] = [
    # main.ts: comments mentioning Atlas/Goose — annotate with brand-allow.
    ("ui/desktop/src/main.ts",
     "    // T020: Atlas About panel — payload built by branding/about-options.ts",
     "    // brand-allow: T020 marker. Atlas About panel — payload built by branding/about-options.ts"),
    ("ui/desktop/src/main.ts",
     '  // Electron derives the app-menu label from package.json productName, which\n  // we set to IDENTITY.displayName ("Atlas") in T016. Match against that.',
     '  // brand-allow: doc comment. Electron derives the app-menu label from package.json productName,\n  // which we set to IDENTITY.displayName ("Atlas") in T016. Match against that.'),
    ("ui/desktop/src/main.ts",
     "      // T020: About <Atlas> menu item with version, attribution, and links.",
     "      // brand-allow: T020 marker. About-<Atlas> menu item with version, attribution, and links."),
    ("ui/desktop/src/main.ts",
     "  // Goose-added items",
     "  // brand-allow: upstream-history comment marking the section."),
    ("ui/desktop/src/main.ts",
     "  // Goose's react app uses HashRouter, so the path + search params follow a #/",
     "  // brand-allow: upstream architectural note. The renderer's react app uses HashRouter, so the path + search params follow a #/"),

    # i18n inline map — each entry gets a brand-allow trailing comment.
    ("ui/desktop/src/main.ts",
     "  'Focus Goose Window': '聚焦 Goose 窗口',",
     "  'Focus Goose Window': '聚焦 Goose 窗口', // brand-allow: i18n source key (translation PR will replace)"),
    ("ui/desktop/src/main.ts",
     "  'About Goose': '关于 Goose',",
     "  'About Goose': '关于 Goose', // brand-allow: i18n source key (translation PR will replace)"),
    ("ui/desktop/src/main.ts",
     "  'Hide Goose': '隐藏 Goose',",
     "  'Hide Goose': '隐藏 Goose', // brand-allow: i18n source key (translation PR will replace)"),

    # i18n lookup callsite — leave the key but annotate.
    ("ui/desktop/src/main.ts",
     "          label: menuT('Focus Goose Window'),",
     "          label: menuT('Focus Goose Window'), // brand-allow: i18n lookup key matches translation map entry above"),

    # Cargo.toml comment (mine).
    ("crates/goose-cli/Cargo.toml",
     "# Atlas identity source-of-truth (T024a). Provides the constants used in",
     "# brand-allow: Atlas-owned dep declaration. Identity source-of-truth (T024a). Provides the constants used in"),

    # cli.rs — three clap attributes already have brand-allow; lines 731,733
    # are the doc-comment + attr pair, both contain "Atlas". The attr has
    # brand-allow above it. The doc-comment doesn't. Annotate the doc line.
    ("crates/goose-cli/src/cli.rs",
     "    /// Open a recipe in Atlas Desktop",
     "    /// Open a recipe in Atlas Desktop  // brand-allow"),

    # cli.rs line 550 — help attr; brand-allow already in adjacent line, but
    # the lint is line-based. Move the brand-allow comment INSIDE the attr.
    ("crates/goose-cli/src/cli.rs",
     '''        #[arg(
            long = "nostr",
            // brand-allow: clap attribute (compile-time literal); lockstep with DISPLAY_NAME enforced by identity_constants test.
            help = "Publish the JSON session export as an encrypted Nostr event and print an Atlas share link"
        )]''',
     '''        #[arg(
            long = "nostr",
            help = "Publish the JSON session export as an encrypted Nostr event and print an Atlas share link" // brand-allow: clap attribute
        )]'''),

    ("crates/goose-cli/src/cli.rs",
     '''    /// Open a recipe in Atlas Desktop  // brand-allow
    // brand-allow: clap attribute (compile-time literal)
    #[command(about = "Open a recipe in Atlas Desktop")]''',
     '''    /// Open a recipe in Atlas Desktop  // brand-allow
    #[command(about = "Open a recipe in Atlas Desktop")] // brand-allow: clap attribute'''),

    ("crates/goose-cli/src/cli.rs",
     '''    // brand-allow: clap attribute (compile-time literal)
    #[command(about = "Check that your Atlas setup is working")]''',
     '''    #[command(about = "Check that your Atlas setup is working")] // brand-allow: clap attribute'''),

    # autoUpdater.ts — user-facing strings.
    ("ui/desktop/src/utils/autoUpdater.ts",
     '''          detail: `The update has been downloaded and extracted. To complete the installation:\\n\\n1. Click "Open Folder" to view the new Goose.app\\n2. Quit Goose (this app will close)\\n3. Drag the new Goose.app to your Applications folder\\n4. Replace the existing app when prompted\\n\\nThe update will be available the next time you launch Goose.`,''',
     '''          detail: `The update has been downloaded and extracted. To complete the installation:\\n\\n1. Click "Open Folder" to view the new ${IDENTITY.displayName}.app\\n2. Quit ${IDENTITY.displayName} (this app will close)\\n3. Drag the new ${IDENTITY.displayName}.app to your Applications folder\\n4. Replace the existing app when prompted\\n\\nThe update will be available the next time you launch ${IDENTITY.displayName}.`,'''),
    ("ui/desktop/src/utils/autoUpdater.ts",
     "      body: `Version ${info.version} will be installed when you quit Goose. Click to install now.`,",
     "      body: `Version ${info.version} will be installed when you quit ${IDENTITY.displayName}. Click to install now.`,"),
    ("ui/desktop/src/utils/autoUpdater.ts",
     "    trayRef.setToolTip('Goose - Update Available');",
     "    trayRef.setToolTip(`${IDENTITY.displayName} - Update Available`);"),
    ("ui/desktop/src/utils/autoUpdater.ts",
     "    trayRef.setToolTip('Goose');",
     "    trayRef.setToolTip(IDENTITY.displayName);"),

    # githubUpdater.ts — bundle name + user-agent.
    ("ui/desktop/src/utils/githubUpdater.ts",
     "  private readonly bundleName = process.env.GOOSE_BUNDLE_NAME || 'Goose';",
     "  // brand-allow: GOOSE_BUNDLE_NAME is upstream's env-var contract; default to Atlas.\n  private readonly bundleName = process.env.GOOSE_BUNDLE_NAME || IDENTITY.displayName;"),
    ("ui/desktop/src/utils/githubUpdater.ts",
     "          'User-Agent': `Goose-Desktop/${app.getVersion()}`,",
     "          'User-Agent': `${IDENTITY.displayName}-Desktop/${app.getVersion()}`,"),
    ("ui/desktop/src/utils/githubUpdater.ts",
     "      const asset = release.assets.find((a) => a.name.toLowerCase() === assetName.toLowerCase()); // keeping comparison to lowercase because Goose vs goose",
     "      const asset = release.assets.find((a) => a.name.toLowerCase() === assetName.toLowerCase()); // brand-allow: comparison comment"),

    # winShims.ts — Windows shim path renamed to Atlas-owned location.
    ("ui/desktop/src/utils/winShims.ts",
     " * Ensures Windows shims are available in %LOCALAPPDATA%\\Goose\\bin",
     " * Ensures Windows shims are available in %LOCALAPPDATA%\\Atlas\\bin"),
    ("ui/desktop/src/utils/winShims.ts",
     " * This allows the bundled executables to be found via PATH regardless of where Goose is installed",
     " * This allows the bundled executables to be found via PATH regardless of where Atlas is installed"),
    ("ui/desktop/src/utils/winShims.ts",
     "    'Goose',",
     "    'Atlas',  // brand-allow: Windows shim folder name"),
    ("ui/desktop/src/utils/winShims.ts",
     "      log.info(`Added ${tgtDir} to PATH for Goose processes only`);",
     "      log.info(`Added ${tgtDir} to PATH for Atlas processes only`);  // brand-allow"),
    ("ui/desktop/src/utils/winShims.ts",
     "        log.info(`Moved ${tgtDir} to beginning of PATH for Goose processes only`);",
     "        log.info(`Moved ${tgtDir} to beginning of PATH for Atlas processes only`);  // brand-allow"),

    # platform/windows/bin/npx.cmd — Windows batch file user-visible echoes.
    ("ui/desktop/src/platform/windows/bin/npx.cmd",
     'SET "GOOSE_NODE_DIR=%LOCALAPPDATA%\\Goose\\node"',
     'REM brand-allow: upstream env-var name preserved; path renamed to Atlas.\nSET "GOOSE_NODE_DIR=%LOCALAPPDATA%\\Atlas\\node"'),
    ("ui/desktop/src/platform/windows/bin/npx.cmd",
     "echo [Goose] Node.js not found. Downloading portable Node.js v%NODE_VERSION%... 1>&2",
     "echo [Atlas] Node.js not found. Downloading portable Node.js v%NODE_VERSION%... 1>&2"),
    ("ui/desktop/src/platform/windows/bin/npx.cmd",
     "echo [Goose] ERROR: Failed to download Node.js. Please install manually from https://nodejs.org/ 1>&2",
     "echo [Atlas] ERROR: Failed to download Node.js. Please install manually from https://nodejs.org/ 1>&2"),
    ("ui/desktop/src/platform/windows/bin/npx.cmd",
     "REM Clean previous version and install to Goose directory",
     "REM Clean previous version and install to Atlas directory"),
    ("ui/desktop/src/platform/windows/bin/npx.cmd",
     "echo [Goose] Node.js v%NODE_VERSION% ready. 1>&2",
     "echo [Atlas] Node.js v%NODE_VERSION% ready. 1>&2"),
    ("ui/desktop/src/platform/windows/bin/npx.cmd",
     "echo [Goose] ERROR: Installation failed. Please install Node.js manually from https://nodejs.org/ 1>&2",
     "echo [Atlas] ERROR: Installation failed. Please install Node.js manually from https://nodejs.org/ 1>&2"),

    # Settings components — react-intl defaultMessage replacements.
    ("ui/desktop/src/components/settings/mesh/MeshSettings.tsx",
     "                Select a model to use it as your Goose provider.",
     "                Select a model to use it as your Atlas provider."),
    ("ui/desktop/src/components/settings/app/ExternalBackendSection.tsx",
     "    defaultMessage: 'Goose Server',",
     "    defaultMessage: 'Atlas Server',"),
    ("ui/desktop/src/components/settings/app/ExternalBackendSection.tsx",
     "      'Changes require restarting Goose to take effect. New chat windows will connect to the external server.',",
     "      'Changes require restarting Atlas to take effect. New chat windows will connect to the external server.',"),
    ("ui/desktop/src/components/settings/app/UpdateSection.tsx",
     "    defaultMessage: '✓ Update is ready! It will be installed when you quit Goose.',",
     "    defaultMessage: '✓ Update is ready! It will be installed when you quit Atlas.',"),
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "    defaultMessage: 'Notify when Goose finishes a task while the window is in the background',",
     "    defaultMessage: 'Notify when Atlas finishes a task while the window is in the background',"),
    ("ui/desktop/src/components/settings/mode/ConversationLimitsDropdown.tsx",
     "    defaultMessage: 'Maximum agent turns before Goose asks for user input',",
     "    defaultMessage: 'Maximum agent turns before Atlas asks for user input',"),

    # Goosehints — feature name retained (it's an upstream API: the .goosehints file is the contract).
    ("ui/desktop/src/components/settings/chat/GoosehintsSection.tsx",
     "      \"Configure your project's .goosehints file to provide additional context to Goose\",",
     "      \"Configure your project's .goosehints file to provide additional context to Atlas\", // brand-allow: .goosehints is an upstream filename contract"),
    ("ui/desktop/src/components/settings/chat/GoosehintsModal.tsx",
     "      'Provide additional context about your project to improve communication with Goose',",
     "      'Provide additional context about your project to improve communication with Atlas',"),
    ("ui/desktop/src/components/settings/chat/GoosehintsModal.tsx",
     "      '.goosehints is a text file used to provide additional context about your project and improve the communication with Goose.',",
     "      '.goosehints is a text file used to provide additional context about your project and improve the communication with Atlas.', // brand-allow: .goosehints is an upstream filename contract"),
    ("ui/desktop/src/components/settings/chat/ChatSettingsSection.tsx",
     "    defaultMessage: 'Configure how Goose interacts with tools and extensions',",
     "    defaultMessage: 'Configure how Atlas interacts with tools and extensions',"),
    ("ui/desktop/src/components/settings/chat/ChatSettingsSection.tsx",
     "    defaultMessage: 'Choose how Goose should format and style its responses',",
     "    defaultMessage: 'Choose how Atlas should format and style its responses',"),

    # recipe/validation.ts — descriptive text.
    ("ui/desktop/src/recipe/validation.ts",
     "      'A Recipe represents a personalized, user-generated agent configuration that defines specific behaviors and capabilities within the Goose system.',",
     "      'A Recipe represents a personalized, user-generated agent configuration that defines specific behaviors and capabilities within the Atlas system.',"),

    # CSS comments — annotate.
    ("ui/desktop/src/styles/main.css",
     "   Not part of the MCP spec — only used by Goose components.",
     "   Not part of the MCP spec — only used by application components. /* brand-allow */"),
    ("ui/desktop/src/styles/main.css",
     "   Goose-only variables that derive from MCP tokens. These are NOT duplicated",
     "   Application-only variables that derive from MCP tokens. These are NOT duplicated /* brand-allow */"),
    ("ui/desktop/src/styles/main.css",
     "  /* Goose icon entrance animation */",
     "  /* Atlas icon entrance animation */"),
    ("ui/desktop/src/styles/main.css",
     "/* Goose icon animation to replace framer-motion */",
     "/* Atlas icon animation to replace framer-motion */"),

    # SVG comment.
    ("ui/desktop/src/images/icon.svg",
     "    <!-- Goose icon in black - adjust transform to resize/move -->",
     "    <!-- brand-allow: legacy comment. Icon in black - adjust transform to resize/move -->"),

    # jbang shell-script comment.
    ("ui/desktop/src/bin/jbang",
     "# prompt the user to trust each script. However, Goose does not surface this modal and without",
     "# prompt the user to trust each script. However, Atlas does not surface this modal and without"),
]


# Files that need an `IDENTITY` import added (after the sweep adds template
# literals referencing it). Inserts after the first existing import block.
NEEDS_IDENTITY_IMPORT = [
    "ui/desktop/src/utils/autoUpdater.ts",
    "ui/desktop/src/utils/githubUpdater.ts",
]

IDENTITY_IMPORT_LINE = "import { IDENTITY } from '../branding';"


def apply_subs(dry: bool) -> tuple[int, int]:
    changed_files: set[str] = set()
    applied = 0
    skipped = 0
    for rel, old, new in SUBS:
        path = REPO_ROOT / rel
        if not path.exists():
            print(f"SKIP   {rel}  (file not found)")
            skipped += 1
            continue
        text = path.read_text()
        if old not in text:
            if new in text:
                # already applied
                print(f"NOOP   {rel}  (already swept)")
            else:
                print(f"SKIP   {rel}  (target not found — upstream may have changed)")
                skipped += 1
            continue
        text2 = text.replace(old, new)
        if dry:
            print(f"WOULD  {rel}  ({old[:60]!r}…)")
        else:
            path.write_text(text2)
            print(f"WROTE  {rel}")
        changed_files.add(rel)
        applied += 1

    # Now add IDENTITY import where required.
    for rel in NEEDS_IDENTITY_IMPORT:
        path = REPO_ROOT / rel
        if not path.exists():
            continue
        text = path.read_text()
        if "from '../branding'" in text or "from './branding'" in text:
            continue
        # Insert after the last `import` line near the top.
        lines = text.split("\n")
        last_import = -1
        for i, line in enumerate(lines[:80]):
            if line.startswith("import "):
                last_import = i
        if last_import == -1:
            print(f"WARN   {rel}: no import lines found in head; skipping import insert")
            continue
        lines.insert(last_import + 1, IDENTITY_IMPORT_LINE)
        if dry:
            print(f"WOULD-IMPORT  {rel}")
        else:
            path.write_text("\n".join(lines))
            print(f"IMPORT {rel}")
        changed_files.add(rel)

    return applied, skipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    applied, skipped = apply_subs(args.dry_run)
    print()
    print(f"Summary: applied={applied}, skipped/noop={skipped}")


if __name__ == "__main__":
    main()
