export interface ExternalGoosedConfig {
  enabled: boolean;
  url: string;
  secret: string;
  certFingerprint?: string;
}

export interface KeyboardShortcuts {
  focusWindow: string | null;
  quickLauncher: string | null;
  newChat: string | null;
  newChatWindow: string | null;
  openDirectory: string | null;
  settings: string | null;
  find: string | null;
  findNext: string | null;
  findPrevious: string | null;
  alwaysOnTop: string | null;
  toggleNavigation: string | null;
}

export type DefaultKeyboardShortcuts = {
  [K in keyof KeyboardShortcuts]: string;
};

export interface SessionSharingConfig {
  enabled: boolean;
  baseUrl: string;
}

/**
 * Spec 007: per-(provider, model) pricing override.
 * Key format: `${provider}/${model}` (case-sensitive, lower-cased provider).
 * Prices are USD per 1M tokens (matches the catalogue convention).
 */
export interface PricingOverride {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Optional cache-hit discount as a fraction 0..1, applied to input cost. */
  cacheHitDiscount?: number;
  /** ISO timestamp the override was last edited; informational only. */
  updatedAt: string;
}

export type PricingOverrides = Record<string, PricingOverride>;

export interface Settings {
  // Desktop app settings
  showMenuBarIcon: boolean;
  showDockIcon: boolean;
  enableWakelock: boolean;
  enableNotifications: boolean;
  spellcheckEnabled: boolean;
  externalGoosed: ExternalGoosedConfig;
  globalShortcut?: string | null;
  keyboardShortcuts: KeyboardShortcuts;

  // UI preferences (migrated from localStorage)
  theme: 'dark' | 'light';
  useSystemTheme: boolean;
  responseStyle: string;
  showPricing: boolean;
  pricingOverrides: PricingOverrides;
  sessionSharing: SessionSharingConfig;
  seenAnnouncementIds: string[];
  /** Spec 023/Item 11 — true once the onboarding tour has been completed or skipped. */
  tourCompleted: boolean;
}

export type SettingKey = keyof Settings;

export const defaultKeyboardShortcuts: DefaultKeyboardShortcuts = {
  focusWindow: 'CommandOrControl+Alt+G',
  quickLauncher: 'CommandOrControl+Alt+Shift+G',
  newChat: 'CommandOrControl+T',
  newChatWindow: 'CommandOrControl+N',
  openDirectory: 'CommandOrControl+O',
  settings: 'CommandOrControl+,',
  find: 'CommandOrControl+F',
  findNext: 'CommandOrControl+G',
  findPrevious: 'CommandOrControl+Shift+G',
  alwaysOnTop: 'CommandOrControl+Shift+T',
  toggleNavigation: 'CommandOrControl+/',
};

export const defaultSettings: Settings = {
  // Desktop app settings
  showMenuBarIcon: true,
  showDockIcon: true,
  enableWakelock: false,
  enableNotifications: true,
  spellcheckEnabled: true,
  keyboardShortcuts: defaultKeyboardShortcuts,
  externalGoosed: {
    enabled: false,
    url: '',
    secret: '',
  },

  // UI preferences
  theme: 'light',
  useSystemTheme: true,
  responseStyle: 'concise',
  showPricing: true,
  pricingOverrides: {},
  tourCompleted: false,
  sessionSharing: {
    enabled: false,
    baseUrl: '',
  },
  seenAnnouncementIds: [],
};

export function getKeyboardShortcuts(settings: Settings): KeyboardShortcuts {
  if (!settings.keyboardShortcuts && settings.globalShortcut !== undefined) {
    const focusShortcut = settings.globalShortcut;
    let launcherShortcut: string | null = null;

    if (focusShortcut) {
      if (focusShortcut.includes('Shift')) {
        launcherShortcut = focusShortcut;
      } else {
        launcherShortcut = focusShortcut.replace(/\+([Gg])$/, '+Shift+$1');
      }
    }

    return {
      ...defaultKeyboardShortcuts,
      focusWindow: focusShortcut,
      quickLauncher: launcherShortcut,
    };
  }
  return { ...defaultKeyboardShortcuts, ...settings.keyboardShortcuts };
}
