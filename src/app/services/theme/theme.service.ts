import { computed, inject, Injectable, signal } from '@angular/core';
import { ThemeParser } from './theme-parser';
import { ThemeValidator } from './theme-validator';
import { ThemeRegistry } from './theme-registry';
import { THEME_STORAGE } from './theme-storage';
import { defaultMode, emptyState, MODE_KEY, safeMode, ThemeMode, ThemeState } from './theme.types';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(THEME_STORAGE);
  private readonly parser = inject(ThemeParser);
  private readonly validator = inject(ThemeValidator);
  private readonly registry = inject(ThemeRegistry);
  private readonly state = signal(emptyState(defaultMode()));
  readonly themes = computed(() => this.state().themes);
  readonly activeId = computed(() => this.state().activeId);
  readonly mode = computed(() => this.state().mode);
  readonly safe = safeMode();
  readonly busy = signal(false);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  private initialization?: Promise<void>;
  private readonly media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  constructor() { this.media?.addEventListener('change', () => this.applyMode()); }
  initialize(): Promise<void> {
    return this.initialization ??= this.restore();
  }
  private async restore(): Promise<void> {
    if (this.safe) { this.state.set(emptyState('light')); this.clearStyle(); this.applyMode(); this.ready.set(true); return; }
    this.busy.set(true);
    try {
      const stored = await this.storage.read();
      if (stored) this.state.set(await this.registry.verify(stored));
      await this.apply();
    } catch {
      this.state.set(emptyState(defaultMode())); this.clearStyle(); this.applyMode();
      this.error.set('無法載入主題，已使用安全預設外觀。登入與廣播仍可正常操作。');
    } finally { this.busy.set(false); this.ready.set(true); }
  }
  private clearStyle(): void { document.getElementById('campus-custom-theme')?.remove(); }
  private applyMode(): void {
    const mode = this.safe ? 'light' : this.mode();
    document.documentElement.dataset['campusMode'] = mode === 'system' ? (this.media?.matches ? 'dark' : 'light') : mode;
  }
  private async apply(): Promise<void> {
    this.applyMode();
    const theme = this.themes().find(t => t.id === this.activeId());
    if (!theme || this.safe) { this.clearStyle(); return; }
    const css = await this.validator.compile(theme.css, theme.checksum.slice(0, 12));
    const style = document.createElement('style'); style.id = 'campus-custom-theme'; style.textContent = css;
    this.clearStyle(); document.body.append(style);
    if (!style.sheet) { style.remove(); throw new Error('瀏覽器安全政策阻擋主題樣式，已停用自訂 CSS。'); }
  }
  private async mutate(operation: () => Promise<ThemeState>, message: string): Promise<void> {
    await this.initialize();
    if (this.busy()) return;
    if (this.safe) { this.error.set('安全模式不載入或啟用自訂主題。請離開安全模式後管理主題。'); return; }
    this.busy.set(true); this.error.set(''); this.notice.set('');
    const previous = this.state();
    let written = false;
    try {
      const next = await operation();
      // Compile before persistence, then atomically persist the entire state.
      const active = next.themes.find(t => t.id === next.activeId);
      if (active) await this.validator.compile(active.css, active.checksum.slice(0, 12));
      await this.storage.write(next);
      written = true;
      this.state.set(next); await this.apply();
      try { localStorage.setItem(MODE_KEY, next.mode); } catch { /* IDB remains authoritative. */ }
      this.notice.set(message || this.notice());
    } catch (error) {
      this.state.set(previous);
      try { await this.apply(); } catch { this.clearStyle(); this.state.set({ ...previous, activeId: null }); }
      if (written) { try { await this.storage.write(this.state()); } catch { /* Safe URL remains available. */ } }
      this.error.set(error instanceof Error ? error.message : '主題操作失敗。');
    } finally { this.busy.set(false); }
  }
  import(css: string, filename: string): Promise<void> {
    return this.mutate(async () => {
      const { theme, warnings } = await this.parser.parse(css, filename);
      await this.validator.compile(theme.css, theme.checksum.slice(0, 12));
      const result = this.registry.install(this.themes(), theme);
      this.notice.set([result.result, ...warnings].join(' '));
      return { ...this.state(), themes: result.themes };
    }, '');
  }
  activate(id: string | null): Promise<void> {
    return this.mutate(async () => {
      if (id && !this.themes().some(t => t.id === id)) throw new Error('找不到這套主題。');
      return { ...this.state(), activeId: id };
    }, id ? '主題已啟用。' : '自訂主題已停用。');
  }
  async setMode(mode: ThemeMode): Promise<void> {
    await this.initialize();
    if (this.busy() || this.safe || !['light', 'dark', 'system'].includes(mode)) return;
    this.busy.set(true); this.error.set('');
    const next = { ...this.state(), mode };
    this.state.set(next); this.applyMode();
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* Still usable in-memory. */ }
    try { await this.storage.write(next); this.notice.set('內建外觀已更新。'); }
    catch { this.error.set('此外觀已套用，但本機儲存失敗；重新整理後可能無法保留。'); }
    finally { this.busy.set(false); }
  }
  remove(id: string): Promise<void> {
    return this.mutate(async () => ({ ...this.state(), themes: this.themes().filter(t => t.id !== id), activeId: this.activeId() === id ? null : this.activeId() }), '主題已刪除。');
  }
  async reset(): Promise<void> {
    await this.initialize();
    if (this.busy()) return;
    this.busy.set(true);
    // Recovery works even with blocked storage or while in safe mode.
    this.clearStyle(); this.state.set({ ...this.state(), activeId: null, mode: defaultMode() }); this.applyMode();
    try { localStorage.removeItem(MODE_KEY); } catch { /* Keep recovery usable. */ }
    try {
      const saved = this.safe ? emptyState(defaultMode()) : this.state();
      await this.storage.write({ ...(saved ?? this.state()), activeId: null, mode: defaultMode() });
      this.error.set(''); this.notice.set('已恢復預設外觀。');
    } catch { this.error.set('本頁已恢復預設，但無法儲存。請使用安全模式 URL 保持預設外觀。'); }
    finally { this.busy.set(false); }
  }
}
