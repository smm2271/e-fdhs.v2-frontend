import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClassDto, PublishDto, TeacherBroadcastApi } from '../../services/broadcast/teacher-broadcast.api';
import { ClassSelector } from './class-selector';
import { RichEditor } from './rich-editor';
import { RichContent, RICH_PREFIX } from './rich-content';

@Component({
  imports: [RouterLink, ClassSelector, RichEditor, RichContent],
  template: `
    <main>
      <nav aria-label="教師廣播導覽"><a routerLink="/">校園系統</a><a routerLink="/broadcasts/new" aria-current="page">發布廣播</a><a routerLink="/broadcasts/mine">我發布的廣播</a></nav>
      <h1>發布廣播</h1><p>選擇班級並編輯通知，發布前可再次確認內容。</p>
      @if (loading()) { <p role="status">正在載入班級……</p> }
      @if (loadError()) { <p role="alert">{{ loadError() }}</p><button (click)="load()">重新載入班級</button> }
      <section><h2>1. 發布對象</h2><app-class-selector [classes]="classes()" [(selected)]="selected" [disabled]="locked()" /></section>
      <section><h2>2. 廣播內容</h2><app-rich-editor [(html)]="html" [(text)]="text" [disabled]="locked()" /></section>
      @if (html().length > 19970) { <p role="alert">內容過長，請縮短通知後發布（包含文字格式最多 19,970 字元）。</p> }
      @if (error() && !modalOpen()) { <p role="alert">{{ error() }}</p> }
      <button class="primary" type="button" [disabled]="loading() || !!loadError() || locked() || !selected().size || !text().trim() || html().length > 19970" (click)="review()">發布廣播</button>
      <dialog #dialog aria-labelledby="review-title" (cancel)="cancel($event)" (close)="modalOpen.set(false)">
        <h2 id="review-title">確認發布廣播</h2>
        <app-rich-content [content]="prefix + snapshot.content" />
        <h3>發布對象 · 共 {{ snapshot.target_group_ids.length }} 個班級</h3>
        <ul>@for (group of snapshotClasses; track group.id) { <li>{{ group.grade_name }} · {{ group.name }}</li> }</ul>
        <p>發布後立即生效，且不可編輯。請確認內容與所有目標班級。</p>
        @if (error()) { <p role="alert">{{ error() }}</p> }
        @if (submitting()) { <p role="status">發布處理中，請稍候……</p> }
        <div class="actions"><button type="button" [disabled]="locked()" (click)="back()">返回編輯</button>
          <button class="primary" type="button" [disabled]="submitting()" (click)="publish()">{{ submitting() ? '發布中…' : uncertain() ? '重試相同發布' : '確認發布' }}</button></div>
      </dialog>
    </main>
  `,
  styleUrl: './teacher.scss',
})
export class BroadcastNew {
  private readonly api = inject(TeacherBroadcastApi);
  private readonly router = inject(Router);
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  readonly classes = signal<ClassDto[]>([]);
  readonly selected = signal(new Set<string>());
  readonly html = signal('');
  readonly text = signal('');
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly uncertain = signal(false);
  readonly modalOpen = signal(false);
  readonly prefix = RICH_PREFIX;
  snapshot: PublishDto = { content: '', content_format: 'html', target_group_ids: [] };
  snapshotClasses: ClassDto[] = [];
  private key = '';
  private destroyed = false;
  locked(): boolean { return this.submitting() || this.uncertain(); }
  ngOnInit(): void { void this.load(); }
  ngOnDestroy(): void { this.destroyed = true; }
  async load(): Promise<void> {
    this.loading.set(true); this.loadError.set('');
    try { const classes = await this.api.classes(); if (!this.destroyed) this.classes.set(classes); }
    catch { this.loadError.set('無法載入班級，請確認登入狀態後重試。'); }
    finally { this.loading.set(false); }
  }
  review(): void {
    if (this.locked() || this.modalOpen() || !this.selected().size || !this.text().trim() || this.html().length > 19970) return;
    this.snapshotClasses = this.classes().filter(g => this.selected().has(g.id));
    this.snapshot = { content: this.html(), content_format: 'html', target_group_ids: this.snapshotClasses.map(g => g.id).sort() };
    if (!this.snapshot.target_group_ids.length) return;
    this.key = crypto.randomUUID(); this.error.set(''); this.modalOpen.set(true);
    this.dialog.nativeElement.showModal();
  }
  cancel(event: Event): void { if (this.locked()) event.preventDefault(); }
  back(): void { if (!this.locked()) { this.dialog.nativeElement.close(); this.modalOpen.set(false); } }
  async publish(): Promise<void> {
    if (this.submitting() || !this.modalOpen()) return;
    this.submitting.set(true); this.error.set('');
    try {
      const record = await this.api.publish(this.snapshot, this.key);
      if (this.destroyed) return;
      this.uncertain.set(false);
      this.dialog.nativeElement.close();
      await this.router.navigate(['/broadcasts/mine'], { state: { publishedBroadcastId: record.id } });
    } catch (error) {
      if (this.destroyed) return;
      const status = (error as { status?: number }).status ?? 0;
      this.uncertain.set(status === 0 || status >= 500);
      this.error.set(this.uncertain()
        ? '尚無法確認發布結果。內容與班級已保留，請重試相同發布以取得結果。'
        : status === 401 || status === 403 ? '登入已失效或沒有發布權限。內容與班級已保留。'
        : status === 409 ? '發布鍵已過期或資料不一致。請先到「我發布的廣播」確認是否已發布。'
        : '發布失敗，請檢查內容與目標班級後重試。內容與選取已保留。');
    } finally { this.submitting.set(false); }
  }
}
