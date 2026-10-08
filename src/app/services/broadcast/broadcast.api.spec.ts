import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BROADCAST_CLOCK, BROADCAST_MOCK, BroadcastStore } from './broadcast.store';
import { BroadcastFeed } from '../../pages/broadcast/broadcast';
import { provideRouter } from '@angular/router';
import { BroadcastDto, BroadcastApi } from './broadcast.api';

const dto = (): BroadcastDto => ({
  id: 'b1',
  sender_name: 'Teacher',
  created_at: '2026-10-07T06:00:00Z',
  content: 'Notice',
  ack_deadline_at: '2026-10-07T08:30:00Z',
  targets: [
    {
      group_id: 'g1',
      group_name: '201',
      can_confirm: true,
      can_reply: true,
      confirmation_state: 'pending',
      confirmation: null,
      reply_count: 0,
      replies: [],
    },
  ],
});
const feed = () => ({
  items: [dto()],
  current_user: { id: 's1', name: 'Officer', role: 'Officer', can_confirm: true, can_reply: true },
  pending_count: 1,
});
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Broadcast API store', () => {
  let http: HttpTestingController;
  let clockDate: string;
  beforeEach(() => {
    clockDate = '2026-10-07T07:00:00Z';
    TestBed.configureTestingModule({
      imports: [BroadcastFeed],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BROADCAST_MOCK, useValue: false },
        { provide: BROADCAST_CLOCK, useValue: () => new Date(clockDate) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function loaded() {
    const store = TestBed.inject(BroadcastStore);
    const request = http.expectOne('/api/broadcasts?limit=100&offset=0');
    expect(request.request.withCredentials).toBe(true);
    request.flush(feed());
    await settle();
    return store;
  }

  it('defaults to the real API and exposes loading, errors, retry and empty data', async () => {
    const store = TestBed.inject(BroadcastStore);
    expect(store.loading()).toBe(true);
    expect(store.broadcasts()).toEqual([]);
    http
      .expectOne('/api/broadcasts?limit=100&offset=0')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await settle();
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeTruthy();
    expect(store.currentUser().canConfirm).toBe(false);
    const retry = store.load();
    http
      .expectOne('/api/broadcasts?limit=100&offset=0')
      .flush({ ...feed(), items: [], pending_count: 0 });
    await retry;
    expect(store.error()).toBe('');
    expect(store.weeklyBroadcasts()).toEqual([]);
  });

  it('updates confirmation and navigation only on success, and blocks duplicate in-flight requests', async () => {
    const store = await loaded();
    const id = store.broadcasts()[0].id;
    const failed = store.confirm(id);
    expect(store.busy().has(id)).toBe(true);
    expect(await store.confirm(id)).toBe(false);
    http
      .expectOne('/api/broadcasts/b1/confirmations')
      .flush({}, { status: 500, statusText: 'Failure' });
    expect(await failed).toBe(false);
    expect(store.broadcasts()[0].confirmation).toBeNull();
    expect(store.pendingCount()).toBe(1);
    const success = store.confirm(id);
    const response = dto();
    response.targets[0].confirmation = {
      confirmed_at: '2026-10-07T07:00:00Z',
      confirmed_by: 'Officer',
      role: 'Officer',
    };
    response.targets[0].confirmation_state = 'confirmed_on_time';
    const request = http.expectOne('/api/broadcasts/b1/confirmations');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ group_id: 'g1' });
    request.flush(response);
    expect(await success).toBe(true);
    expect(store.broadcasts()[0].confirmation?.confirmedBy).toBe('Officer');
    expect(store.pendingCount()).toBe(0);
    expect(await store.confirm(id)).toBe(false);
    expect(store.busy().size).toBe(0);
  });

  it('uses per-target backend capabilities even when the current user has general permissions', async () => {
    const store = TestBed.inject(BroadcastStore);
    const response = feed();
    response.items[0].targets[0].can_confirm = false;
    response.items[0].targets[0].can_reply = false;
    http.expectOne('/api/broadcasts?limit=100&offset=0').flush(response);
    await settle();
    const b = store.broadcasts()[0];
    expect(store.canConfirm(b)).toBe(false);
    expect(store.canReply(b)).toBe(false);
    expect(await store.confirm(b.id)).toBe(false);
    expect(await store.addReply(b.id, 'Denied')).toBe(false);
    store.setUser('student-1');
    expect(store.currentUser().id).toBe('s1');
  });

  it('preserves the existing feed and reply count when a reply fails', async () => {
    const store = await loaded();
    const id = store.broadcasts()[0].id;
    const failed = store.addReply(id, 'Received');
    http
      .expectOne('/api/broadcasts/b1/replies')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(await failed).toBe(false);
    expect(store.broadcasts()[0].replies).toEqual([]);
    const success = store.addReply(id, ' Received ');
    const request = http.expectOne('/api/broadcasts/b1/replies');
    expect(request.request.body).toEqual({ content: 'Received', group_id: 'g1', ref_id: null });
    const response = dto();
    response.targets[0].replies = [
      {
        id: 'r1',
        author_name: 'Officer',
        role: 'Officer',
        created_at: '2026-10-07T07:00:00Z',
        content: 'Received',
        replies: [],
      },
    ];
    response.targets[0].reply_count = 1;
    request.flush(response);
    expect(await success).toBe(true);
    expect(store.replyCount(store.broadcasts()[0].replies)).toBe(1);
    expect(store.pendingCount()).toBe(1);
  });

  it('loads subsequent pages so the feed and badge include more than 100 broadcasts', async () => {
    const promise = TestBed.inject(BroadcastApi).feed();
    http
      .expectOne('/api/broadcasts?limit=100&offset=0')
      .flush({ ...feed(), items: Array.from({ length: 100 }, dto) });
    await settle();
    http.expectOne('/api/broadcasts?limit=100&offset=100').flush(feed());
    expect((await promise).items).toHaveLength(101);
  });

  it('reloads at the Taipei week boundary and clears the previous-week badge', async () => {
    vi.useFakeTimers();
    try {
      const store = TestBed.inject(BroadcastStore);
      http.expectOne('/api/broadcasts?limit=100&offset=0').flush(feed());
      await vi.advanceTimersByTimeAsync(0);
      expect(store.pendingCount()).toBe(1);
      clockDate = '2026-10-12T00:00:00+08:00';
      await vi.advanceTimersByTimeAsync(60000);
      expect(store.pendingCount()).toBe(0);
      expect(store.loading()).toBe(true);
      http
        .expectOne('/api/broadcasts?limit=100&offset=0')
        .flush({ ...feed(), items: [], pending_count: 0 });
      await vi.advanceTimersByTimeAsync(0);
      expect(store.weekLabel()).toBe('10/12 \u2014 10/18');
      expect(store.weeklyBroadcasts()).toEqual([]);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('keeps the UI draft and avoids a success notice after a failed submission', async () => {
    const fixture = TestBed.createComponent(BroadcastFeed);
    fixture.detectChanges();
    http.expectOne('/api/broadcasts?limit=100&offset=0').flush(feed());
    await settle();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const id = component.store.broadcasts()[0].id;
    component.drafts[id] = 'Keep my draft';
    const submitted = component.submitReply(id);
    http.expectOne('/api/broadcasts/b1/replies').flush({}, { status: 500, statusText: 'Failure' });
    await submitted;
    fixture.detectChanges();
    expect(component.drafts[id]).toBe('Keep my draft');
    expect(component.notice()).toBe('');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.mock-controls')).toBeNull();
  });
});

describe('Broadcast transport mode', () => {
  it('uses the API by default', () => expect(TestBed.inject(BROADCAST_MOCK)).toBe(false));
  it('explicit mock mode needs no HTTP provider or requests', () => {
    TestBed.configureTestingModule({ providers: [{ provide: BROADCAST_MOCK, useValue: true }] });
    const store = TestBed.inject(BroadcastStore);
    expect(store.broadcasts().length).toBeGreaterThan(0);
    expect(store.loading()).toBe(false);
  });
});
