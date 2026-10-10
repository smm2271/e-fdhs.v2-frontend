import { inject, Injectable } from '@angular/core';
import { ThemeParser } from './theme-parser';
import { ThemeValidator } from './theme-validator';
import { InstalledTheme, MAX_THEMES, ThemeState } from './theme.types';

@Injectable({ providedIn: 'root' })
export class ThemeRegistry {
  private readonly parser = inject(ThemeParser);
  private readonly validator = inject(ThemeValidator);
  async verify(state: ThemeState): Promise<ThemeState> {
    if (!state || state.schema !== 1 || !Array.isArray(state.themes) || state.themes.length > MAX_THEMES ||
      !['system', 'light', 'dark'].includes(state.mode) || (state.activeId !== null && typeof state.activeId !== 'string')) throw new Error('主題儲存格式損毀。');
    const themes: InstalledTheme[] = [];
    for (const stored of state.themes) {
      if (typeof stored.css !== 'string' || !Number.isFinite(Date.parse(stored.installedAt)) || !Number.isFinite(Date.parse(stored.updatedAt))) throw new Error('主題資料損毀。');
      const { theme } = await this.parser.parse(stored.css);
      if (theme.id !== stored.id || theme.checksum !== stored.checksum) throw new Error('主題識別或 checksum 不一致。');
      await this.validator.compile(theme.css, theme.checksum.slice(0, 12));
      themes.push({ ...theme, installedAt: stored.installedAt, updatedAt: stored.updatedAt });
    }
    if (new Set(themes.map(t => t.id)).size !== themes.length || (state.activeId && !themes.some(t => t.id === state.activeId))) throw new Error('主題清單或啟用狀態損毀。');
    return { ...state, themes };
  }
  install(themes: InstalledTheme[], incoming: InstalledTheme): { themes: InstalledTheme[]; result: string } {
    const previous = themes.find(t => t.id === incoming.id);
    if (previous?.checksum === incoming.checksum) return { themes, result: '相同主題已安裝，未重複新增。' };
    if (previous) {
      const before = previous.metadata.version.split('.').map(Number);
      const after = incoming.metadata.version.split('.').map(Number);
      let difference = 0;
      for (let i = 0; i < 3; i++) if (before[i] !== after[i]) { difference = after[i] - before[i]; break; }
      if (difference <= 0) throw new Error('相同 @id 的更新必須提高 @version；不允許同版覆寫或降版。');
      return { themes: themes.map(t => t.id === incoming.id ? { ...incoming, installedAt: previous.installedAt } : t), result: '主題已更新。' };
    }
    if (themes.length >= MAX_THEMES) throw new Error('最多安裝 10 套主題，請先刪除不用的主題。');
    return { themes: [...themes, incoming], result: '主題已安裝，請選擇啟用。' };
  }
}
