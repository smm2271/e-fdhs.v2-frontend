import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ThemeParser } from './theme-parser';
import { ThemeValidator } from './theme-validator';
import { compileThemeCss } from './theme-compiler';
import { ThemeRegistry } from './theme-registry';
import { ThemeService } from './theme.service';
import { THEME_STORAGE, ThemeStorage } from './theme-storage';
import { ThemeState } from './theme.types';

const css = readFileSync(resolve(process.cwd(), 'public/themes/fdhs-classic.theme.css'), 'utf8');
class ClassicStorage extends ThemeStorage {
  state: ThemeState | null = null;
  async read() { return structuredClone(this.state); }
  async write(state: ThemeState) { this.state = structuredClone(state); }
}

describe('FDHS Classic package and Day 26 contract', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    history.replaceState({}, '', '/');
    localStorage.clear();
    document.getElementById('campus-custom-theme')?.remove();
    TestBed.configureTestingModule({ providers: [{ provide: THEME_STORAGE, useClass: ClassicStorage }] });
  });
  afterEach(() => {
    document.getElementById('campus-custom-theme')?.remove();
    vi.unstubAllGlobals();
  });

  it('parses the distributed file and passes the unchanged validator', async () => {
    const { theme, warnings } = await new ThemeParser().parse(css, 'fdhs-classic.theme.css');
    expect(warnings).toEqual([]);
    expect(theme.id).toBe('theme:fdhs.classic');
    expect(theme.metadata).toEqual({ name: 'FDHS Classic', description: '經典數位校園視覺主題', version: '1.0.0', author: 'Zalic' });
    const compiled = await new ThemeValidator().compile(css, theme.checksum.slice(0, 12));
    expect(compiled).toContain('#campus-theme-root .campus-student-broadcasts');
    expect(compiled).toMatch(/nth-child\(even of\s*\.broadcast-card\)/);
    expect(compiled).toContain('@media (max-width:768px)');
    expect(compiled).not.toContain('#campus-theme-root{');
    expect(compiled).not.toContain('.login-card');
    expect(compiled).not.toContain('url(');
  });

  it('installs, activates, persists, verifies, disables and deletes the actual package', async () => {
    const service = TestBed.inject(ThemeService);
    await service.initialize();
    await service.import(css, 'fdhs-classic.theme.css');
    await service.activate('theme:fdhs.classic');
    expect(service.activeId()).toBe('theme:fdhs.classic');
    expect(document.querySelectorAll('#campus-custom-theme')).toHaveLength(1);
    const saved = await TestBed.inject(THEME_STORAGE).read();
    expect((await TestBed.inject(ThemeRegistry).verify(saved!)).activeId).toBe('theme:fdhs.classic');
    await service.activate(null);
    expect(document.getElementById('campus-custom-theme')).toBeNull();
    await service.remove('theme:fdhs.classic');
    expect(service.themes()).toEqual([]);
  });

  it('supports variables, pseudo-elements, Grid/Flex, media and namespaced keyframes', () => {
    const probe = ':root{--test:#4268c4}.campus-nav{display:flex;transition:color 100ms}.campus-nav a:hover::before{content:"";color:var(--test)}@media(min-width:900px){.broadcast-card{display:grid;grid-template-columns:1fr 2fr;animation:classic-probe 100ms}}@keyframes classic-probe{from{opacity:.9}to{opacity:1}}';
    const compiled = compileThemeCss(probe, 'day27');
    expect(compiled).toContain('#campus-theme-root{--test:#4268c4}');
    expect(compiled).toContain('a:hover::before');
    expect(compiled).toContain('display:grid');
    expect(compiled).toContain('animation:campus-day27-classic-probe');
    expect(compiled).toContain('@keyframes campus-day27-classic-probe');
  });
});
