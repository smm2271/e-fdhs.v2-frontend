export type ThemeMode = 'system' | 'light' | 'dark';
export interface ThemeMetadata { name: string; description: string; version: string; author: string; }
export interface InstalledTheme {
  id: string; metadata: ThemeMetadata; css: string; checksum: string;
  installedAt: string; updatedAt: string;
}
export interface ThemeState { schema: 1; themes: InstalledTheme[]; activeId: string | null; mode: ThemeMode; }
export const MAX_THEME_BYTES = 128 * 1024;
export const MAX_THEMES = 10;
export const MODE_KEY = 'campus.theme.mode.v1';
export const emptyState = (mode: ThemeMode = 'system'): ThemeState => ({ schema: 1, themes: [], activeId: null, mode });
export function defaultMode(): ThemeMode {
  const value = document.querySelector<HTMLMetaElement>('meta[name="campus-default-mode"]')?.content;
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function safeMode(): boolean { return new URLSearchParams(location.search).get('theme-safe') === '1'; }
