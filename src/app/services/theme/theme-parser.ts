import { Injectable } from '@angular/core';
import { MAX_THEME_BYTES, InstalledTheme } from './theme.types';

export async function checksum(css: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(css));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

@Injectable({ providedIn: 'root' })
export class ThemeParser {
  async parse(css: string, filename = 'import.theme.css'): Promise<{ theme: InstalledTheme; warnings: string[] }> {
    if (!filename.toLowerCase().endsWith('.theme.css')) throw new Error('請選擇 .theme.css 檔案。');
    if (new TextEncoder().encode(css).length > MAX_THEME_BYTES) throw new Error('主題檔案上限為 128 KiB。');
    const source = css.replace(/^\uFEFF/, '').trimStart();
    if (!source.startsWith('/**')) throw new Error('檔案開頭必須有 /** metadata 註解。');
    const end = source.indexOf('*/');
    if (end < 0) throw new Error('Metadata 註解未結束。');
    const tags = new Map<string, string>();
    for (const line of source.slice(3, end).split(/\r?\n/)) {
      const entry = line.trim().replace(/^\*\s?/, '').match(/^@(name|description|version|author|id)\s+(.*)$/);
      if (!entry) continue;
      if (tags.has(entry[1])) throw new Error(`Metadata @${entry[1]} 重複。`);
      if (entry[2].length > 500) throw new Error('Metadata 欄位最多 500 字元。');
      tags.set(entry[1], entry[2].trim());
    }
    if (!tags.get('name')) throw new Error('缺少 @name。');
    const version = tags.get('version') || '0.0.0';
    if (!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version)) throw new Error('@version 必須為數字 major.minor.patch。');
    const explicit = tags.get('id');
    if (explicit && !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(explicit)) throw new Error('@id 請使用 3–80 個小寫英數、點、底線或連字號。');
    const digest = await checksum(css);
    const now = new Date().toISOString();
    return { theme: {
      id: explicit ? 'theme:' + explicit : 'sha256:' + digest,
      metadata: { name: tags.get('name')!, description: tags.get('description') || '未提供描述',
        author: tags.get('author') || '未提供作者', version },
      css, checksum: digest, installedAt: now, updatedAt: now,
    }, warnings: [
      ...(!explicit ? ['未提供 @id：以檔案 SHA-256 識別；修改檔案將視為另一套主題。需要版本更新時請使用固定 @id。'] : []),
      ...(['description', 'author', 'version'].filter(tag => !tags.get(tag)).map(tag => `缺少 @${tag}，已使用預設值。`)),
    ] };
  }
}
