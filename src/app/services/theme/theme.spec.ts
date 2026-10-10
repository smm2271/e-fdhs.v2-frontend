import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { ThemeParser } from './theme-parser';
import { compileThemeCss } from './theme-compiler';
import { ThemeRegistry } from './theme-registry';
import { ThemeService } from './theme.service';
import { ThemeStorage, IndexedDbThemeStorage, THEME_STORAGE, IDB_FACTORY } from './theme-storage';
import { emptyState, InstalledTheme, ThemeState } from './theme.types';

const source = (version = '1.0.0', rules = ':root{--campus-accent:#8b8cff}.broadcast-card{border-radius:18px;animation:pulse 1s ease}@keyframes pulse{from{opacity:.8}to{opacity:1}}') => `/**
 * @id midnight.campus
 * @name Midnight Campus
 * @description 深色校園主題
 * @version ${version}
 * @author Zalic
 */\n${rules}`;

class MemoryStorage extends ThemeStorage {
  state: ThemeState | null = null;
  failRead = false; failWrite = false;
  reads = 0;
  async read() { this.reads++; if (this.failRead) throw new Error('Storage unavailable'); return structuredClone(this.state); }
  async write(state: ThemeState) { if (this.failWrite) throw new Error('Storage full'); this.state = structuredClone(state); }
}

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  history.replaceState({}, '', '/');
  localStorage.clear();
  document.getElementById('campus-custom-theme')?.remove();
});
afterEach(() => { vi.unstubAllGlobals(); document.getElementById('campus-custom-theme')?.remove(); history.replaceState({}, '', '/'); });

describe('Theme metadata and registry', () => {
  it('parses all metadata, fixed ID and exact source checksum', async () => {
    const { theme, warnings } = await new ThemeParser().parse(source());
    expect(theme.id).toBe('theme:midnight.campus');
    expect(theme.metadata).toEqual({ name: 'Midnight Campus', author: 'Zalic', version: '1.0.0', description: '深色校園主題' });
    expect(theme.checksum).toHaveLength(64); expect(warnings).toEqual([]);
  });
  it('uses content-addressed IDs and explicit defaults when optional metadata is absent', async () => {
    const parser = new ThemeParser();
    const css = '/**\n * @name Minimal\n */\n.x{color:red}';
    const first = await parser.parse(css); const duplicate = await parser.parse(css);
    expect(first.theme.id).toBe(duplicate.theme.id);
    expect(first.theme.id).toMatch(/^sha256:/); expect(first.warnings).toHaveLength(4);
    expect(first.theme.metadata.version).toBe('0.0.0');
    expect((await parser.parse(css + '\n')).theme.id).not.toBe(first.theme.id);
  });
  it.each([
    ['.x{color:red}', 'x.theme.css'],
    ['/** @name Missing close', 'x.theme.css'],
    ['/**\n * @author A\n */.x{color:red}', 'x.theme.css'],
    [source().replace('@version 1.0.0', '@version latest'), 'x.theme.css'],
    [source().replace('@id midnight.campus', '@id INVALID ID'), 'x.theme.css'],
    [source().replace('@name Midnight Campus', '@name Midnight Campus\n * @name Another'), 'x.theme.css'],
    [source(), 'x.css'], [source() + ' '.repeat(128 * 1024), 'x.theme.css'],
  ])('rejects invalid metadata/file format %#', async (css, name) => {
    await expect(new ThemeParser().parse(css, name)).rejects.toThrow();
  });
  it('deduplicates, updates by fixed ID after rename and rejects same/lower version conflicts', async () => {
    const registry = TestBed.inject(ThemeRegistry); const parser = TestBed.inject(ThemeParser);
    const first = (await parser.parse(source())).theme;
    expect(registry.install([first], first).themes).toHaveLength(1);
    const update = (await parser.parse(source('1.1.0').replace('Midnight Campus', 'Renamed Campus'))).theme;
    const changed = registry.install([first], update).themes;
    expect(changed).toHaveLength(1); expect(changed[0].metadata.name).toBe('Renamed Campus');
    expect(changed[0].installedAt).toBe(first.installedAt);
    expect(() => registry.install(changed, first)).toThrow('提高');
    const conflict = (await parser.parse(source('1.1.0', '.x{color:blue}'))).theme;
    expect(() => registry.install(changed, conflict)).toThrow('提高');
  });
  it('enforces the installed-theme quota', async () => {
    const registry = TestBed.inject(ThemeRegistry);
    const theme = (await TestBed.inject(ThemeParser).parse(source())).theme;
    const list = Array.from({ length: 10 }, (_, i) => ({ ...theme, id: String(i) }));
    expect(() => registry.install(list, theme)).toThrow('10');
  });
});

describe('CSS AST validation and confinement', () => {
  const validator = { compile: compileThemeCss };
  it('compiles root tokens, individual selector prefixes, media, supports and namespaced animation', () => {
    const css = validator.compile(source(), 'abc123');
    expect(css).toContain('#campus-theme-root{--campus-accent:#8b8cff}');
    expect(css).toContain('#campus-theme-root .broadcast-card');
    expect(css).toContain('@keyframes campus-abc123-pulse');
    expect(css).toContain('animation:campus-abc123-pulse');
    const nested = validator.compile('@media(max-width:600px){.a,.b:hover{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}@supports(display:grid){.x{color:rgb(1,2,3)}}', 'x');
    expect(nested).toContain('#campus-theme-root .a,#campus-theme-root .b:hover');
  });
  it.each([
    '@import "https://evil.test/a.css";', '@\\69mport "https://evil.test";',
    '.x{background:url(https://evil.test)}', '.x{background:u\\72l("https://evil.test")}',
    '.x{--asset:url(data:image/svg+xml,x)}', '.x{background:image-set("https://evil.test/x" 1x)}',
    '.x{background:-webkit-image-set("x" 1x)}', '@font-face{font-family:x;src:url(x)}',
    '.x{behavior:url(x.htc)}', '.x{-moz-binding:url(x)}', '.x{color:expression(alert(1))}',
    '.x{color:e\\78pression(alert(1))}', '.x{background:paint(foo)}',
    '.x{background:unknown(var(--value))}', '.x{content:attr(value)}',
    '@namespace x "https://evil.test";', '@page{color:red}',
    ':root + .campus-theme-recovery{display:none}', ':root:not(.x){color:red}',
    'body{color:red}', 'html{color:red}', 'app-root{display:none}',
    '.x::backdrop{display:none}', '.x{color:red;.y{display:none}}',
    '.x{color}', '.x{color:red}}', '.x{animation:pulse 1s!important}',
    '.x{transition:all 1s!important}', '.x{animation:var(--animation)}',
    '.x{content:"</style><script>alert(1)</script>";background:url(x)}',
  ])('rejects unsafe or unsupported CSS %#', css => { expect(() => validator.compile(css, 'x')).toThrow(); });
  it('allows gradients, layout, shadows and normal transitions beyond color tokens', () => {
    expect(validator.compile('.login-card{display:flex;gap:2rem;box-shadow:0 1px 2px #000;border-radius:3rem;background:linear-gradient(45deg,red,blue);transition:transform 180ms ease}.login-card:hover{transform:translateY(-2px)}', 'x')).toContain('translateY');
  });
});

describe('IndexedDB storage', () => {
  it('stores and reads source, metadata, timestamps, mode and active ID atomically', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: IDB_FACTORY, useValue: new IDBFactory() }] });
    const storage = TestBed.inject(IndexedDbThemeStorage);
    expect(await storage.read()).toBeNull();
    const theme = (await new ThemeParser().parse(source())).theme;
    const state = { ...emptyState('dark'), themes: [theme], activeId: theme.id };
    await storage.write(state); expect(await storage.read()).toEqual(state);
    await storage.write(emptyState()); expect((await storage.read())?.themes).toEqual([]);
  });
  it('rejects unavailable IndexedDB without blocking the application', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: IDB_FACTORY, useValue: undefined }] });
    await expect(TestBed.inject(IndexedDbThemeStorage).read()).rejects.toThrow('IndexedDB');
  });
});

describe('Theme lifecycle and recovery', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({ providers: [{ provide: THEME_STORAGE, useValue: storage }] });
  });
  it('installs, activates, switches one style, disables and deletes', async () => {
    const service = TestBed.inject(ThemeService); await service.initialize();
    await service.import(source(), 'midnight.theme.css'); const first = service.themes()[0];
    expect(service.activeId()).toBeNull(); await service.activate(first.id);
    expect(document.querySelectorAll('#campus-custom-theme')).toHaveLength(1);
    await service.import(source().replace('midnight.campus', 'second.campus'), 'second.theme.css');
    await service.activate(service.themes()[1].id);
    expect(document.querySelectorAll('#campus-custom-theme')).toHaveLength(1);
    expect(service.activeId()).toBe(service.themes()[1].id);
    await service.activate(null); expect(document.getElementById('campus-custom-theme')).toBeNull();
    await service.activate(first.id); await service.remove(first.id);
    expect(service.activeId()).toBeNull(); expect(service.themes()).toHaveLength(1);
  });
  it('restores persisted themes and active CSS after a fresh service instance', async () => {
    let service = TestBed.inject(ThemeService); await service.import(source(), 'x.theme.css'); await service.activate(service.themes()[0].id);
    const saved = structuredClone(storage.state);
    TestBed.resetTestingModule(); storage = new MemoryStorage(); storage.state = saved;
    TestBed.configureTestingModule({ providers: [{ provide: THEME_STORAGE, useValue: storage }] });
    service = TestBed.inject(ThemeService); await service.initialize();
    expect(service.activeId()).toBe(saved?.activeId); expect(document.getElementById('campus-custom-theme')?.textContent).toContain('border-radius:18px');
  });
  it('updates the active theme without adding a second stylesheet', async () => {
    const service = TestBed.inject(ThemeService); await service.import(source(), 'x.theme.css'); await service.activate(service.themes()[0].id);
    await service.import(source('2.0.0', '.broadcast-card{border-radius:30px}'), 'x.theme.css');
    expect(service.themes()).toHaveLength(1); expect(document.getElementById('campus-custom-theme')?.textContent).toContain('30px');
  });
  it('honors system dark preference and explicit manual override on media changes', async () => {
    const events = new EventTarget(); let dark = true;
    vi.stubGlobal('matchMedia', () => ({ get matches() { return dark; }, addEventListener: events.addEventListener.bind(events) }));
    const service = TestBed.inject(ThemeService); await service.initialize();
    expect(document.documentElement.dataset['campusMode']).toBe('dark');
    await service.setMode('light'); events.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset['campusMode']).toBe('light');
    await service.setMode('system'); dark = false; events.dispatchEvent(new Event('change'));
    expect(document.documentElement.dataset['campusMode']).toBe('light');
  });
  it('safe URL bypasses all stored CSS and even avoids a storage read', async () => {
    history.replaceState({}, '', '/settings/themes?theme-safe=1'); storage.failRead = true;
    const service = TestBed.inject(ThemeService); await service.initialize();
    expect(service.safe).toBe(true); expect(storage.reads).toBe(0);
    expect(document.getElementById('campus-custom-theme')).toBeNull();
    expect(document.documentElement.dataset['campusMode']).toBe('light');
    await service.import(source(), 'x.theme.css'); expect(service.themes()).toHaveLength(0);
  });
  it('falls back on corrupt/loading failure and keeps built-ins usable when storage is unavailable', async () => {
    storage.failRead = true; storage.failWrite = true;
    const service = TestBed.inject(ThemeService); await service.initialize();
    expect(service.ready()).toBe(true); expect(service.error()).toContain('安全預設');
    await service.setMode('dark'); expect(service.mode()).toBe('dark');
    expect(document.documentElement.dataset['campusMode']).toBe('dark');
    await service.reset(); expect(service.activeId()).toBeNull(); expect(service.error()).toContain('本頁已恢復');
  });
  it('rejects persisted CSS tampering and missing active IDs', async () => {
    const theme = (await TestBed.inject(ThemeParser).parse(source())).theme;
    storage.state = { ...emptyState(), themes: [{ ...theme, css: source('1.0.0', '.x{background:url(https://evil.test)}') }], activeId: theme.id };
    const service = TestBed.inject(ThemeService); await service.initialize();
    expect(service.activeId()).toBeNull(); expect(service.error()).toContain('安全預設');
    await expect(TestBed.inject(ThemeRegistry).verify({ ...emptyState(), activeId: 'missing' })).rejects.toThrow();
  });
  it('does not install or switch styles on storage write failure', async () => {
    const service = TestBed.inject(ThemeService); await service.initialize(); storage.failWrite = true;
    await service.import(source(), 'x.theme.css'); expect(service.themes()).toEqual([]);
    expect(service.error()).toBe('Storage full'); expect(document.getElementById('campus-custom-theme')).toBeNull();
  });
  it('restores defaults while preserving installed themes in normal mode', async () => {
    const service = TestBed.inject(ThemeService); await service.import(source(), 'x.theme.css'); await service.activate(service.themes()[0].id);
    await service.reset(); expect(service.activeId()).toBeNull(); expect(service.themes()).toHaveLength(1);
    expect(storage.state?.activeId).toBeNull(); expect(document.getElementById('campus-custom-theme')).toBeNull();
  });
  it('safe reset never reads stored CSS and clears damaged local state', async () => {
    history.replaceState({}, '', '/settings/themes?theme-safe=1');
    storage.state = { ...emptyState(), activeId: 'corrupt' };
    const service = TestBed.inject(ThemeService); await service.reset();
    expect(storage.reads).toBe(0); expect(storage.state).toEqual(emptyState());
  });
  it('rolls back persistent activation when browser policy blocks stylesheet loading', async () => {
    const service = TestBed.inject(ThemeService); await service.import(source(), 'x.theme.css');
    const blocked = vi.spyOn(HTMLStyleElement.prototype, 'sheet', 'get').mockReturnValue(null);
    await service.activate(service.themes()[0].id);
    expect(service.activeId()).toBeNull(); expect(storage.state?.activeId).toBeNull();
    expect(document.getElementById('campus-custom-theme')).toBeNull();
    expect(service.error()).toContain('安全政策'); blocked.mockRestore();
  });
});
