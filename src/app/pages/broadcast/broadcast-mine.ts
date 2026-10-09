import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BroadcastDto } from '../../services/broadcast/broadcast.api';
import { TeacherBroadcastApi } from '../../services/broadcast/teacher-broadcast.api';
import { RichContent } from './rich-content';

@Component({
  imports: [DatePipe, RouterLink, RichContent],
  template: `<main>
    <nav aria-label="教師廣播導覽"><a routerLink="/">校園系統</a><a routerLink="/broadcasts/new">發布廣播</a><a routerLink="/broadcasts/mine" aria-current="page">我發布的廣播</a></nav>
    <h1>我發布的廣播</h1><p>每 30 秒更新各班確認進度。</p>
    <button (click)="refresh()" [disabled]="loading()">{{ loading() ? '更新中…' : '更新進度' }}</button>
    @if (error()) { <p role="alert">{{ error() }}</p> }
    @for (item of items(); track item.id) {
      <article [id]="'broadcast-' + item.id" [class.fresh]="item.id === freshId">
        @if (item.id === freshId) { <span class="badge" role="status">剛剛發布</span> }
        <h2>發布時間 <time [attr.datetime]="item.created_at">{{ item.created_at | date:'yyyy/MM/dd HH:mm':'+0800' }}</time></h2>
        <app-rich-content [content]="item.content" />
        <p>目標班級：@for (target of item.targets; track target.group_id; let last = $last) { {{ target.group_name }}{{ last ? '' : '、' }} }</p>
        <p>已確認 {{ confirmed(item) }}／{{ item.targets.length }} 班</p>
        <progress [value]="confirmed(item)" [max]="item.targets.length" [attr.aria-label]="'已確認 ' + confirmed(item) + '／' + item.targets.length + ' 班'"></progress>
        <details><summary>查看各班確認狀態</summary>
          @for (target of item.targets; track target.group_id) {
            <div class="target"><strong>{{ target.group_name }}</strong><span>{{ stateLabel(target.confirmation_state) }}</span>
              <span>@if (target.confirmation; as confirmation) { {{ confirmation.role }} · {{ confirmation.confirmed_by }}<br />{{ confirmation.confirmed_at | date:'yyyy/MM/dd HH:mm':'+0800' }} } @else { — }</span>
            </div>
          }
        </details>
      </article>
    } @empty { @if (!loading() && !error()) { <p>尚未發布廣播。<a routerLink="/broadcasts/new">發布第一則廣播</a></p> } }
  </main>`,
  styleUrl: './teacher.scss',
})
export class BroadcastMine {
  private readonly api = inject(TeacherBroadcastApi);
  readonly items = signal<BroadcastDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly freshId: string | null;
  private timer?: ReturnType<typeof setInterval>;
  private controller = new AbortController();
  private located = false;
  constructor() {
    const router = inject(Router);
    this.freshId = router.currentNavigation()?.extras.state?.['publishedBroadcastId'] ?? null;
  }
  ngOnInit(): void {
    // Consume navigation state once; refreshing/re-entering cannot revive a badge.
    const state = { ...history.state }; delete state.publishedBroadcastId;
    history.replaceState(state, '');
    void this.refresh();
    this.timer = setInterval(() => { if (!document.hidden) void this.refresh(); }, 30000);
    document.addEventListener('visibilitychange', this.visible);
  }
  private readonly visible = () => { if (!document.hidden) void this.refresh(); };
  ngOnDestroy(): void {
    clearInterval(this.timer); this.controller.abort();
    document.removeEventListener('visibilitychange', this.visible);
  }
  async refresh(): Promise<void> {
    if (this.loading() || this.controller.signal.aborted) return;
    this.loading.set(true);
    try {
      const records = await this.api.mine(this.controller.signal);
      if (this.controller.signal.aborted) return;
      // Locate by the returned publication ID even when ordering changes.
      const fresh = records.find(r => r.id === this.freshId);
      this.items.set(fresh ? [fresh, ...records.filter(r => r.id !== fresh.id)] : records);
      this.error.set('');
      if (fresh && !this.located) {
        this.located = true;
        setTimeout(() => document.getElementById('broadcast-' + fresh.id)?.scrollIntoView({ block: 'nearest' }));
      }
    } catch (error) {
      if (!this.controller.signal.aborted) {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403) this.items.set([]);
        this.error.set(status === 401 || status === 403 ? '登入已失效或沒有管理權限，請重新登入。'
          : '無法更新確認進度，顯示上次取得的資料。請確認登入狀態後重試。');
      }
    } finally { this.loading.set(false); }
  }
  confirmed(item: BroadcastDto): number {
    return item.targets.filter(t => ['confirmed_on_time', 'confirmed_late'].includes(t.confirmation_state ?? '')).length;
  }
  stateLabel(state: BroadcastDto['targets'][number]['confirmation_state']): string {
    return ({ pending: '尚未確認', overdue: '逾期未確認', confirmed_on_time: '準時確認', confirmed_late: '逾期補確認' })[state ?? 'pending'];
  }
}
