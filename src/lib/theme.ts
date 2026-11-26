import { useSyncExternalStore } from 'react';

/**
 * Appearance mirror. Settings live in IndexedDB, which is async, so the first paint can't wait for them.
 * The applied appearance is mirrored to localStorage and read by the inline script in index.html before
 * any CSS paints — no dark→light flash on reload. Keep the key and shape in sync with that script.
 */
export const APPEARANCE_KEY = 'ascend.appearance';

export interface Appearance {
  theme: 'dark' | 'light' | 'system';
  accent: string;
  motion: 'full' | 'reduce' | 'system';
}

export type ResolvedTheme = 'dark' | 'light';

export function resolveTheme(pref: Appearance['theme'], systemPrefersLight: boolean): ResolvedTheme {
  return pref === 'light' || (pref === 'system' && systemPrefersLight) ? 'light' : 'dark';
}

export function mirrorAppearance(a: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
  } catch {
    // Storage blocked (private mode, quota): the pre-paint falls back to dark, then React corrects it.
  }
}

export function readAppearance(): Partial<Appearance> {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Appearance>) : {};
  } catch {
    return {};
  }
}

function subscribe(onChange: () => void): () => void {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
}

const snapshot = (): ResolvedTheme => (document.documentElement.classList.contains('light') ? 'light' : 'dark');

/** The theme actually on screen (resolves 'system'). Follows the root class, so it is always what the CSS uses. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, snapshot, () => 'dark');
}

export const THEME_CYCLE: Record<Appearance['theme'], Appearance['theme']> = { dark: 'light', light: 'system', system: 'dark' };
export const THEME_LABEL: Record<Appearance['theme'], string> = { dark: 'Dark', light: 'Light', system: 'System' };
