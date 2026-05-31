#!/usr/bin/env python3
"""One-shot sweep of remaining 'goose' strings in Settings UI → Atlas."""
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

SUBS: list[tuple[str, str, str]] = [
    ("ui/desktop/src/components/settings/config/ConfigSettings.tsx",
     "    defaultMessage: 'Edit your goose configuration settings',",
     "    defaultMessage: 'Edit your Atlas configuration settings', // brand-allow"),
    ("ui/desktop/src/components/settings/config/ConfigSettings.tsx",
     "    defaultMessage: 'Edit your goose configuration settings (current settings for {provider})',",
     "    defaultMessage: 'Edit your Atlas configuration settings (current settings for {provider})', // brand-allow"),
    ("ui/desktop/src/components/settings/PromptsSettingsSection.tsx",
     "    defaultMessage: \"Customize the prompts that define goose's behavior in different contexts. These prompts use Jinja2 templating syntax. Be careful when modifying template variables, as incorrect changes can break functionality. Please share any improvements with the community.\",",
     "    defaultMessage: \"Customize the prompts that define Atlas's behavior in different contexts. These prompts use Jinja2 templating syntax. Be careful when modifying template variables, as incorrect changes can break functionality.\", // brand-allow"),
    ("ui/desktop/src/components/settings/mesh/MeshSettings.tsx",
     "            When you start the mesh, keep goose running to stay connected.",
     "            When you start the mesh, keep Atlas running to stay connected. {/* brand-allow */}"),
    ("ui/desktop/src/components/settings/mesh/MeshSettings.tsx",
     "            Keep goose running to stay connected to the mesh.",
     "            Keep Atlas running to stay connected to the mesh. {/* brand-allow */}"),
    ("ui/desktop/src/components/settings/app/TelemetrySettings.tsx",
     "    defaultMessage: 'Help improve goose by sharing anonymous usage statistics.',",
     "    defaultMessage: 'Help improve Atlas by sharing anonymous usage statistics.', // brand-allow"),
    ("ui/desktop/src/components/settings/app/ExternalBackendSection.tsx",
     "      'By default goose launches a server for you, use this to connect to an external goose server',",
     "      'By default Atlas launches a server for you, use this to connect to an external Atlas server', // brand-allow"),
    ("ui/desktop/src/components/settings/app/ExternalBackendSection.tsx",
     "    defaultMessage: 'Connect to a goose server running elsewhere (requires app restart)',",
     "    defaultMessage: 'Connect to an Atlas server running elsewhere (requires app restart)', // brand-allow"),
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "    defaultMessage: 'Configure how goose appears on your system',",
     "    defaultMessage: 'Configure how Atlas appears on your system', // brand-allow"),
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "    defaultMessage: 'Show goose in the menu bar',",
     "    defaultMessage: 'Show Atlas in the menu bar', // brand-allow"),
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "  dockIconDesc: { id: 'settings.dockIcon.description', defaultMessage: 'Show goose in the dock' },",
     "  dockIconDesc: { id: 'settings.dockIcon.description', defaultMessage: 'Show Atlas in the dock' }, // brand-allow"),
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "    defaultMessage: 'Customize the look and feel of goose',",
     "    defaultMessage: 'Customize the look and feel of Atlas', // brand-allow"),
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "    defaultMessage: 'Help us improve goose by reporting issues or requesting new features',",
     "    defaultMessage: 'Help us improve Atlas by reporting issues or requesting new features', // brand-allow"),
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "    defaultMessage: 'Check for and install updates to keep goose running at its best',",
     "    defaultMessage: 'Check for and install updates to keep Atlas running at its best', // brand-allow"),
    # Both lines 92 and 112 are identical — handle with replace_all-style 2 passes.
    ("ui/desktop/src/components/settings/app/AppSettingsSection.tsx",
     "    defaultMessage: 'Find and select goose in the application list',",
     "    defaultMessage: 'Find and select Atlas in the application list', // brand-allow"),
]


def main():
    applied = 0
    skipped = 0
    for rel, old, new in SUBS:
        path = REPO / rel
        if not path.exists():
            print(f"SKIP   {rel}  (not found)")
            skipped += 1
            continue
        text = path.read_text()
        if old not in text:
            print(f"SKIP   {rel}  (target not present)")
            skipped += 1
            continue
        path.write_text(text.replace(old, new))
        print(f"WROTE  {rel}")
        applied += 1
    print()
    print(f"Summary: applied={applied}, skipped={skipped}")


if __name__ == "__main__":
    main()
