import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ThemeService } from '../../services/theme/theme.service';
import { MAX_THEME_BYTES } from '../../services/theme/theme.types';

@Component({
  imports: [RouterLink],
  template: `<main class="campus-page theme-settings">
    <nav class="campus-nav"><a routerLink="/">登入／首頁</a><a routerLink="/broadcasts">查看廣播</a></nav>
    <h1>外觀設定</h1>
    <p>主題僅儲存在此瀏覽器，切換不需要重新登入。共用裝置上的帳號共用此外觀偏好。</p>
    @if (theme.safe) { <p class="theme-safe-notice" role="status">安全模式：不讀取或套用已安裝的自訂 CSS。恢復預設會清除本機主題以修復損毀資料。<a href="/settings/themes">離開安全模式</a></p> }
    @if (!theme.ready()) { <p role="status">正在讀取本機主題……</p> }
    @if (theme.error()) { <p class="campus-error" role="alert">{{ theme.error() }}</p> }
    @if (theme.notice()) { <p role="status">{{ theme.notice() }}</p> }
    <section class="campus-panel"><h2>內建外觀</h2>
      <div class="theme-actions" role="group" aria-label="內建外觀">
        @for (mode of modes; track mode.value) { <button type="button" [attr.aria-pressed]="theme.mode() === mode.value" [disabled]="theme.busy() || theme.safe" (click)="theme.setMode(mode.value)">{{ mode.label }}</button> }
      </div><p>個人自訂主題優先於內建外觀，手動 Light／Dark 優先於系統偏好。</p>
    </section>
    <section class="campus-panel"><h2>匯入主題</h2>
      <label for="theme-file">選擇 .theme.css（最多 128 KiB）</label>
      <input id="theme-file" type="file" accept=".theme.css,text/css" [disabled]="theme.busy() || theme.safe" (change)="importFile($event)" />
      <a href="/themes/midnight-campus.theme.css" download>下載 Midnight Campus 範例主題</a>
      <p>主題可改變布局與遮蔽操作。只匯入信任的來源；禁止 URL 資源與 JavaScript。故障時可直接開啟安全模式。</p>
    </section>
    <section class="campus-panel"><h2>已安裝主題（{{ theme.themes().length }}／10）</h2>
      <div class="theme-list">@for (item of theme.themes(); track item.id) {
        <article class="theme-card" [class.theme-active]="theme.activeId() === item.id">
          <h3>{{ item.metadata.name }}</h3><p>{{ item.metadata.description }}</p>
          <p>作者：{{ item.metadata.author }} · 版本：{{ item.metadata.version }}</p>
          <small class="theme-id">{{ item.id }}</small>
          <div class="theme-actions"><button type="button" [disabled]="theme.busy() || theme.safe" (click)="theme.activate(theme.activeId() === item.id ? null : item.id)">{{ theme.activeId() === item.id ? '停用' : '啟用' }} {{ item.metadata.name }}</button>
            <button type="button" [disabled]="theme.busy() || theme.safe" (click)="theme.remove(item.id)">刪除 {{ item.metadata.name }}</button></div>
        </article>
      } @empty { <p>尚未安裝自訂主題。</p> }</div>
    </section>
    <div class="theme-actions"><button type="button" [disabled]="theme.busy()" (click)="theme.reset()">恢復預設外觀</button><a href="/settings/themes?theme-safe=1">直接進入安全模式</a></div>
  </main>`,
  styles: `:host { display:block; } main { max-width:1000px; margin:auto; padding:1.3rem 1rem 5rem; line-height:1.6; }
    nav,.theme-actions { display:flex; flex-wrap:wrap; gap:.7rem; align-items:center; margin:.7rem 0; }
    h1 { font-size:1.8rem; font-weight:700; } h2 { font-size:1.25rem; font-weight:700; } h3 { font-weight:700; }
    section,.theme-card { padding:1rem; border:1px solid var(--campus-border); border-radius:var(--campus-radius); margin:1rem 0; background:var(--campus-surface); }
    .theme-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr)); gap:1rem; }
    .theme-card { margin:0; min-width:0; overflow-wrap:anywhere; } .theme-active { border:2px solid var(--campus-accent); }
    button { padding:.6rem .8rem; border:1px solid var(--campus-accent); border-radius:var(--campus-radius); background:var(--campus-surface); color:var(--campus-text); cursor:pointer; }
    button[aria-pressed=true] { background:var(--campus-accent); color:var(--campus-on-accent); } button:disabled { opacity:.5; }
    input { max-width:100%; display:block; margin:.6rem 0; } .theme-id { color:var(--campus-muted); font-size:.8rem; }
    a { color:var(--campus-accent); } .campus-error { color:var(--campus-danger); }`,
})
export class Themes {
  readonly theme = inject(ThemeService);
  readonly modes = [{ value: 'system' as const, label: '跟隨系統' }, { value: 'light' as const, label: 'Light' }, { value: 'dark' as const, label: 'Dark' }];
  ngOnInit(): void { void this.theme.initialize(); }
  async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_THEME_BYTES) throw new Error('主題檔案上限為 128 KiB。');
      await this.theme.import(await file.text(), file.name);
    } catch (error) { this.theme.error.set(error instanceof Error ? error.message : '無法讀取檔案。'); }
    finally { input.value = ''; }
  }
}
