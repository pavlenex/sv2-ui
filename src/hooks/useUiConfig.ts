import { useEffect, useState } from 'react';

type UiConfig = {
  // Stored as HSL triplet string, e.g. '240 5% 96%'. Undefined = use CSS theme default.
  secondary?: string;
  // Data URL for a custom sidebar logo (base64-encoded image)
  customLogo?: string;
};

const STORAGE_KEY = 'sv2-ui-config';

const DEFAULT_CONFIG: UiConfig = {
  secondary: undefined,
  customLogo: undefined,
};

function loadConfig(): UiConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<UiConfig>;
    return {
      secondary: parsed.secondary || undefined,
      customLogo: parsed.customLogo || undefined,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: UiConfig) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Parse an HSL triplet string "H S% L%" into its components.
 */
function parseHsl(triplet: string): { h: number; s: number; l: number } {
  const [hStr, sStr, lStr] = triplet.split(' ');
  return {
    h: parseFloat(hStr),
    s: parseFloat(sStr.replace('%', '')),
    l: parseFloat(lStr.replace('%', '')),
  };
}

function hsl(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;
}

/**
 * Apply the brand color as the primary accent throughout the UI.
 *
 * Replaces the default cyan with the user-chosen hue across:
 * --primary, --ring, --sidebar-primary, --sidebar-ring, --chart-1,
 * and the accent surface tints (--accent, --sidebar-accent).
 */
function applyCssVariables(config: UiConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.removeProperty('--sidebar');

  // All CSS vars that derive from the primary/brand accent
  const primaryVars = [
    '--primary', '--ring',
    '--sidebar-primary', '--sidebar-ring',
    '--chart-1',
  ];
  const accentSurfaceVars = ['--accent', '--sidebar-accent'];
  const accentFgVars = ['--accent-foreground', '--sidebar-accent-foreground'];

  if (config.secondary) {
    const { h, s, l } = parseHsl(config.secondary);
    const isDark = root.classList.contains('dark');

    // Primary accent at appropriate lightness for theme contrast
    const primaryL = isDark ? Math.max(l, 50) : Math.min(l, 45);
    const primary = hsl(h, s, primaryL);

    for (const v of primaryVars) root.style.setProperty(v, primary);

    // Primary foreground: white on dark-enough accent, black on light accent
    const fgColor = primaryL > 55 ? '0 0% 0%' : '0 0% 100%';
    root.style.setProperty('--primary-foreground', fgColor);
    root.style.setProperty('--sidebar-primary-foreground', fgColor);

    // Accent surfaces: a very subtle tint of the brand hue
    if (isDark) {
      for (const v of accentSurfaceVars) root.style.setProperty(v, hsl(h, Math.min(s, 20), 12));
      for (const v of accentFgVars) root.style.setProperty(v, '0 0% 98%');
    } else {
      for (const v of accentSurfaceVars) root.style.setProperty(v, hsl(h, Math.min(s, 40), 95));
      for (const v of accentFgVars) root.style.setProperty(v, hsl(h, s, 30));
    }
  } else {
    for (const v of [...primaryVars, ...accentSurfaceVars, ...accentFgVars]) {
      root.style.removeProperty(v);
    }
    root.style.removeProperty('--primary-foreground');
    root.style.removeProperty('--sidebar-primary-foreground');
  }
}

export function useUiConfig() {
  const [config, setConfig] = useState<UiConfig>(() => loadConfig());

  useEffect(() => {
    applyCssVariables(config);
    saveConfig(config);
  }, [config]);

  // Re-apply CSS variables when the theme (dark/light) changes, because
  // tint lightness differs per theme.
  useEffect(() => {
    if (typeof document === 'undefined' || !config.secondary) return;
    const observer = new MutationObserver(() => applyCssVariables(config));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, [config]);

  const updateConfig = (partial: Partial<UiConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  return { config, updateConfig };
}

