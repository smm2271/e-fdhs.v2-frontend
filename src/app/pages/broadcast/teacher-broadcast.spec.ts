import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { of, firstValueFrom, throwError } from 'rxjs';
import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { ClassSelector } from './class-selector';
import { RichContent, RICH_PREFIX } from './rich-content';
import { RichEditor } from './rich-editor';
import { BroadcastNew } from './broadcast-new';
import { BroadcastMine } from './broadcast-mine';
import { ClassDto, TeacherBroadcastApi } from '../../services/broadcast/teacher-broadcast.api';
import { BroadcastDto } from '../../services/broadcast/broadcast.api';
import { AuthService } from '../../services/auth.service';
import { teacherGuard } from '../../services/teacher.guard';

const classes: ClassDto[] = [
  { id: 'a', name: '101 普通班', grade_id: 'grade-1', grade_name: '一年級' },
  { id: 'b', name: '102', grade_id: 'grade-1', grade_name: '一年級' },
  { id: 'c', name: '201', grade_id: 'grade-2', grade_name: '二年級' },
];
const broadcast = (id: string): BroadcastDto => ({
  id, sender_name: '老師', created_at: '2026-10-09T05:00:00Z', content: '通知', ack_deadline_at: '2026-10-09T08:30:00Z',
  targets: [
    { group_id: 'a', group_name: '101', can_confirm: false, can_reply: true, confirmation_state: 'confirmed_on_time', confirmation: { confirmed_by: '甲', role: '資訊股長', confirmed_at: '2026-10-09T06:00:00Z' }, replies: [], reply_count: 0 },
    { group_id: 'b', group_name: '102', can_confirm: false, can_reply: true, confirmation_state: 'confirmed_late', confirmation: { confirmed_by: '乙', role: '班代表', confirmed_at: '2026-10-09T09:00:00Z' }, replies: [], reply_count: 0 },
    { group_id: 'c', group_name: '201', can_confirm: false, can_reply: true, confirmation_state: 'overdue', confirmation: null, replies: [], reply_count: 0 },
  ],
});

describe('Grade/class selector', () => {
  let fixture: ComponentFixture<ClassSelector>;
  beforeEach(async () => {
    fixture = TestBed.createComponent(ClassSelector);
    fixture.componentRef.setInput('classes', classes);
    await fixture.whenStable();
  });
  it('expands and collapses a nested grade without losing selection', async () => {
    const c = fixture.componentInstance;
    expect(fixture.nativeElement.querySelectorAll('.classes').length).toBe(0);
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.classes label').length).toBe(2);
    c.selectClass('a', true); c.toggle('grade-1');
    await fixture.whenStable();
    expect(c.selected().has('a')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.classes').length).toBe(0);
  });
  it('supports multiple grades, whole-grade toggling and indeterminate state', async () => {
    const c = fixture.componentInstance;
    c.selectClass('a', true); c.selectClass('c', true);
    await fixture.whenStable();
    const checkbox = fixture.nativeElement.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(checkbox.indeterminate).toBe(true);
    c.selectGrade(classes.slice(0, 2), true);
    await fixture.whenStable();
    expect(checkbox.checked).toBe(true); expect(checkbox.indeterminate).toBe(false);
    expect(c.selected().size).toBe(3);
    c.selectGrade(classes.slice(0, 2), false);
    expect([...c.selected()]).toEqual(['c']);
  });
  it('searches class names, auto-opens nested results and retains full selected list', async () => {
    const c = fixture.componentInstance;
    c.selectGrade(classes, true); c.search.set('普通');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.classes label').length).toBe(1);
    expect(c.selectedClasses()).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('details li').length).toBe(3);
    c.search.set('201'); expect(c.visible(classes)).toEqual([classes[2]]);
    c.search.set(''); expect(c.selected().size).toBe(3);
  });
  it('keeps grade/class hierarchy independent of viewport and disables mutation when locked', async () => {
    vi.stubGlobal('innerWidth', 375);
    fixture.componentInstance.toggle('grade-2');
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.grade .grade-heading')).toBeTruthy();
    fixture.componentInstance.selectClass('c', true);
    expect(fixture.componentInstance.selected().size).toBe(0);
    vi.unstubAllGlobals();
  });
});

describe('Safe rich-text display and editing', () => {
  it('preserves legacy literal text and renders supported formatting through Angular sanitization', async () => {
    const fixture = TestBed.createComponent(RichContent);
    fixture.componentRef.setInput('content', '<strong>literal</strong>\nsecond line');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('strong')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<strong>literal</strong>');
    fixture.componentRef.setInput('content', RICH_PREFIX + '<h2>Title</h2><p><strong>Bold</strong><em>Italic</em><script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">bad</a></p>');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h2').textContent).toBe('Title');
    expect(fixture.nativeElement.querySelector('strong').textContent).toBe('Bold');
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.querySelector('a').hasAttribute('onclick')).toBe(false);
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toMatch(/^unsafe:/);
  });
  it('provides formatting tools, captures WYSIWYG input and rejects unsafe links', async () => {
    const fixture = TestBed.createComponent(RichEditor); await fixture.whenStable();
    const editor = fixture.nativeElement.querySelector('.editor');
    editor.innerHTML = '<p><strong>Hello</strong></p>';
    editor.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.html()).toContain('<strong>Hello</strong>');
    expect(fixture.componentInstance.text()).toBe('Hello');
    expect(fixture.nativeElement.querySelectorAll('.toolbar button').length).toBe(6);
    fixture.componentInstance.link('javascript:alert(1)');
    expect(fixture.componentInstance.error).toContain('請輸入');
  });
});

describe('Teacher publishing flow', () => {
  let fixture: ComponentFixture<BroadcastNew>;
  let api: { classes: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn> };
  let navigate: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    vi.stubGlobal('crypto', webcrypto);
    api = { classes: vi.fn().mockResolvedValue(classes), publish: vi.fn().mockResolvedValue(broadcast('new-id')) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TeacherBroadcastApi, useValue: api }] });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(BroadcastNew); await fixture.whenStable();
    // jsdom lacks native dialog methods; browser E2E verifies the actual dialog.
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new Event('close')); };
    const c = fixture.componentInstance;
    c.selected.set(new Set(['a', 'c'])); c.html.set('<p><strong>通知</strong></p>'); c.text.set('通知');
  });
  afterEach(() => { fixture.destroy(); vi.unstubAllGlobals(); });
  it('reviews complete content and targets; cancel never publishes', async () => {
    const c = fixture.componentInstance; c.review(); await fixture.whenStable();
    expect(api.publish).not.toHaveBeenCalled();
    const dialog = fixture.nativeElement.querySelector('dialog');
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('strong').textContent).toBe('通知');
    expect(dialog.textContent).toContain('101 普通班'); expect(dialog.textContent).toContain('201');
    expect(dialog.textContent).toContain('不可編輯');
    c.back(); expect(dialog.open).toBe(false); expect(api.publish).not.toHaveBeenCalled();
  });
  it('requires a class and visible content before opening confirmation', () => {
    const c = fixture.componentInstance; c.selected.set(new Set()); c.review();
    expect(c.modalOpen()).toBe(false);
    c.selected.set(new Set(['a'])); c.text.set(' '); c.review(); expect(c.modalOpen()).toBe(false);
  });
  it('blocks duplicate clicks and navigates using exact returned broadcast ID', async () => {
    const c = fixture.componentInstance; c.review();
    let resolve!: (v: BroadcastDto) => void;
    api.publish.mockReturnValue(new Promise<BroadcastDto>(r => resolve = r));
    const pending = c.publish(); await c.publish();
    expect(api.publish).toHaveBeenCalledTimes(1); expect(c.submitting()).toBe(true);
    const cancel = new Event('cancel', { cancelable: true }); c.cancel(cancel); expect(cancel.defaultPrevented).toBe(true);
    resolve(broadcast('exact-id')); await pending;
    expect(navigate).toHaveBeenCalledWith(['/broadcasts/mine'], { state: { publishedBroadcastId: 'exact-id' } });
    expect(api.publish.mock.calls[0][0].target_group_ids).toEqual(['a', 'c']);
  });
  it('preserves content and classes on validation failure and allows return to editor', async () => {
    api.publish.mockRejectedValue({ status: 422 });
    const c = fixture.componentInstance; c.review(); await c.publish();
    expect(c.html()).toContain('通知'); expect([...c.selected()]).toEqual(['a', 'c']);
    expect(navigate).not.toHaveBeenCalled(); expect(c.error()).toContain('發布失敗');
    c.back(); expect(c.modalOpen()).toBe(false);
  });
  it('retries unknown outcomes with the same key and immutable payload', async () => {
    api.publish.mockRejectedValueOnce({ status: 0 }).mockResolvedValueOnce(broadcast('replayed'));
    const c = fixture.componentInstance; c.review(); await c.publish();
    expect(c.uncertain()).toBe(true); c.back(); expect(c.modalOpen()).toBe(true);
    await c.publish();
    expect(api.publish.mock.calls[1]).toEqual(api.publish.mock.calls[0]);
    expect(navigate).toHaveBeenCalledWith(['/broadcasts/mine'], { state: { publishedBroadcastId: 'replayed' } });
  });
});

describe('Teacher management', () => {
  it('locates exact publication, shows group-based progress, consumes badge state and refreshes', async () => {
    const api = { mine: vi.fn().mockResolvedValue([broadcast('other'), broadcast('new')]) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TeacherBroadcastApi, useValue: api }] });
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'currentNavigation').mockReturnValue({ extras: { state: { publishedBroadcastId: 'new' } } } as never);
    history.replaceState({ publishedBroadcastId: 'new' }, '');
    const fixture = TestBed.createComponent(BroadcastMine); await fixture.whenStable();
    expect(fixture.componentInstance.items()[0].id).toBe('new');
    expect(fixture.nativeElement.querySelectorAll('.badge').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.fresh').id).toBe('broadcast-new');
    expect(history.state.publishedBroadcastId).toBeUndefined();
    expect(fixture.nativeElement.querySelector('progress').value).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('2／3');
    expect(fixture.nativeElement.textContent).toContain('準時確認');
    expect(fixture.nativeElement.textContent).toContain('逾期補確認');
    expect(fixture.nativeElement.textContent).toContain('逾期未確認');
    api.mine.mockResolvedValue([broadcast('new')]); await fixture.componentInstance.refresh();
    expect(fixture.componentInstance.items()).toHaveLength(1);
    fixture.destroy();
    vi.mocked(router.currentNavigation).mockReturnValue(null);
    const revisited = TestBed.createComponent(BroadcastMine); await revisited.whenStable();
    expect(revisited.nativeElement.querySelector('.badge')).toBeNull(); revisited.destroy();
  });
  it('polls every 30 seconds without overlap and stops on page destruction', async () => {
    vi.useFakeTimers();
    const api = { mine: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: TeacherBroadcastApi, useValue: api }] });
    const fixture = TestBed.createComponent(BroadcastMine); fixture.detectChanges();
    await Promise.resolve(); await Promise.resolve();
    expect(api.mine).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30000); expect(api.mine).toHaveBeenCalledTimes(2);
    fixture.destroy(); await vi.advanceTimersByTimeAsync(60000); expect(api.mine).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('Teacher route authorization experience', () => {
  it.each(['student', 'teacher', 'unauthenticated'])('guards %s identity using session profile', async identity => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: {
      me: () => identity === 'unauthenticated' ? throwError(() => ({ status: 401 })) : of({ account_type: identity }),
    } }] });
    const result = await firstValueFrom(TestBed.runInInjectionContext(() => teacherGuard({} as never, {} as never)) as ReturnType<typeof of>);
    if (identity === 'teacher') expect(result).toBe(true);
    else expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(identity === 'student' ? '/broadcasts' : '/');
  });
});
