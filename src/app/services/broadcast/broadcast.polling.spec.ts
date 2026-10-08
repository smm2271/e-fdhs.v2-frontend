import { webcrypto } from 'node:crypto';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import {
  BROADCAST_CLOCK,
  BROADCAST_MOCK,
  BROADCAST_POLL_MS,
  BroadcastStore,
} from './broadcast.store';
import { BroadcastFeed } from '../../pages/broadcast/broadcast';
import { BroadcastDto } from './broadcast.api';
import { syncFixture } from './broadcast.sync.fixture';
import { SyncResponse } from './broadcast.sync.types';
import { AuthService } from '../auth.service';

const dto = (): BroadcastDto => ({
  id: 'b1',
  author_id: 'a1',
  sender_name: 'Teacher',
  content: 'Notice',
  created_at: '2026-10-07T06:00:00Z',
  ack_deadline_at: '2026-10-07T08:30:00Z',
  targets: [
    {
      group_id: 'g1',
      group_name: '201',
      can_confirm: true,
      can_reply: true,
      confirmation_state: 'pending',
      confirmation: null,
      replies: [],
      reply_count: 0,
    },
  ],
});
const unchanged = (response: SyncResponse): SyncResponse => ({
  ...response,
  windows: response.windows.map((w) => ({ ...w, layers: {} })),
});

describe('Incremental polling and recovery', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    TestBed.configureTestingModule({
      imports: [BroadcastFeed],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BROADCAST_MOCK, useValue: false },
        { provide: BROADCAST_CLOCK, useValue: () => new Date('2026-10-07T07:00:00Z') },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function loaded() {
    const initial = await syncFixture([dto()]);
    const store = TestBed.inject(BroadcastStore);
    http.expectOne('/api/broadcasts/sync').flush(initial);
    await vi.waitFor(() => expect(store.loading()).toBe(false));
    return { store, initial };
  }

  it('uses 30 seconds by default, does not overlap, and cancels a request when the component is destroyed', async () => {
    const { store, initial } = await loaded();
    expect(TestBed.inject(BROADCAST_POLL_MS)).toBe(30000);
    vi.useFakeTimers();
    store.startPolling();
    await vi.advanceTimersByTimeAsync(29999);
    http.expectNone('/api/broadcasts/sync');
    await vi.advanceTimersByTimeAsync(1);
    // Native SHA-256 runs asynchronously; let its promise settle without adding another interval.
    await vi.waitFor(() => expect(store.syncing()).toBe(true));
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    expect(pending!.request.body.windows[0].hashes).toEqual(initial.windows[0].hashes);
    await vi.advanceTimersByTimeAsync(60000);
    http.expectNone('/api/broadcasts/sync');
    store.stopPolling();
    expect(pending!.cancelled).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    http.expectNone('/api/broadcasts/sync');
  });

  it('does not replace Store data when all hashes match', async () => {
    const { store, initial } = await loaded();
    const rows = store.broadcasts();
    const poll = store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    expect(pending!.request.body.windows[0].hashes).toEqual(initial.windows[0].hashes);
    pending!.flush(unchanged(initial));
    await poll;
    expect(store.broadcasts()).toBe(rows);
  });

  it('replaces only the changed layer, discovers a new window, and removes vanished windows', async () => {
    const { store, initial } = await loaded();
    const replies = store.broadcasts()[0].replies;
    const confirmed = dto();
    confirmed.targets[0].confirmation = {
      confirmed_by_account_id: 's1',
      confirmed_at: '2026-10-07T07:00:00Z',
      confirmed_by: 'Officer',
      role: 'Officer',
    };
    const changed = await syncFixture([confirmed]);
    delete changed.windows[0].layers.broadcasts;
    delete changed.windows[0].layers.replies;
    let poll = store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush(changed);
    await poll;
    expect(store.pendingCount()).toBe(0);
    expect(store.broadcasts()[0].replies).toBe(replies);
    const added = await syncFixture([{ ...dto(), id: 'b2', content: 'New' }], '2026-W41', 'w2');
    const merged = { ...changed, windows: [...unchanged(changed).windows, ...added.windows] };
    poll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush(merged);
    await poll;
    expect(store.broadcasts()).toHaveLength(2);
    poll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush({ ...added, removed_window_ids: ['w1'], windows: unchanged(added).windows });
    await poll;
    expect(store.broadcasts().map((b) => b.broadcastId)).toEqual(['b2']);
  });

  it('preserves an expanded thread, draft, row DOM and scroll position during polling', async () => {
    const initial = await syncFixture([dto()]);
    const fixture = TestBed.createComponent(BroadcastFeed);
    fixture.detectChanges();
    http.expectOne('/api/broadcasts/sync').flush(initial);
    await vi.waitFor(() => expect(fixture.componentInstance.store.loading()).toBe(false));
    const component = fixture.componentInstance;
    const id = component.store.broadcasts()[0].id;
    component.toggle(id);
    component.drafts[id] = 'Unsent draft';
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('.broadcast-row');
    const page = fixture.nativeElement.querySelector('main');
    page.scrollTop = 123;
    const changed = dto();
    changed.targets[0].replies = [
      {
        id: 'r1',
        author_id: 's1',
        author_name: 'Other officer',
        role: 'Officer',
        content: 'New reply',
        created_at: '2026-10-07T07:01:00Z',
        replies: [],
      },
    ];
    const response = await syncFixture([changed]);
    delete response.windows[0].layers.broadcasts;
    delete response.windows[0].layers.confirmations;
    const poll = component.store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush(response);
    await poll;
    fixture.detectChanges();
    expect(component.expanded().has(id)).toBe(true);
    expect(component.drafts[id]).toBe('Unsent draft');
    expect(fixture.nativeElement.querySelector('.broadcast-row')).toBe(row);
    expect(page.scrollTop).toBe(123);
    fixture.destroy();
  });

  it('keeps data on a network failure and recovers on the next poll', async () => {
    const { store, initial } = await loaded();
    const rows = store.broadcasts();
    let poll = store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.error(new ProgressEvent('network'));
    await poll;
    expect(store.broadcasts()).toBe(rows);
    expect(store.error()).toBeTruthy();
    poll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush(unchanged(initial));
    await poll;
    expect(store.error()).toBe('');
    expect(store.broadcasts()).toBe(rows);
  });

  it.each([401, 403])('clears private data for HTTP %s', async (status) => {
    const { store } = await loaded();
    const poll = store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush({}, { status, statusText: 'Unauthorized' });
    await poll;
    expect(store.broadcasts()).toEqual([]);
    expect(store.pendingCount()).toBe(0);
    expect(store.currentUser().canReply).toBe(false);
  });

  it('buffers chunked layers and discards a raced snapshot without partial UI changes', async () => {
    const { store, initial } = await loaded();
    const rows = store.broadcasts();
    const next = dto();
    next.targets[0].replies = [
      {
        id: 'r1',
        author_id: 's1',
        author_name: 'Officer',
        role: 'Officer',
        content: 'First',
        created_at: '2026-10-07T07:00:00Z',
        replies: [],
      },
      {
        id: 'r2',
        author_id: 's1',
        author_name: 'Officer',
        role: 'Officer',
        content: 'Second',
        created_at: '2026-10-07T07:01:00Z',
        replies: [],
      },
    ];
    const full = await syncFixture([next]);
    const response = structuredClone(full);
    delete response.windows[0].layers.broadcasts;
    delete response.windows[0].layers.confirmations;
    response.windows[0].layers.replies!.records = response.windows[0].layers.replies!.records.slice(
      0,
      1,
    );
    response.windows[0].layers.replies!.next_offset = 1;
    let poll = store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush(response);
    let chunk;
    await vi.waitFor(() => {
      chunk = http.expectOne((req) => req.url.endsWith('/sync/windows/w1/layers/replies'));
    });
    expect(store.broadcasts()).toBe(rows);
    chunk!.flush({}, { status: 409, statusText: 'Snapshot changed' });
    await poll;
    expect(store.broadcasts()).toBe(rows);
    poll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush(response);
    await vi.waitFor(() => {
      chunk = http.expectOne((req) => req.url.endsWith('/sync/windows/w1/layers/replies'));
    });
    chunk!.flush({
      ...full.windows[0].layers.replies!,
      records: full.windows[0].layers.replies!.records.slice(1),
      offset: 1,
      next_offset: null,
      schema_version: 1,
      scope_key: full.scope_key,
    });
    await poll;
    expect(store.broadcasts()[0].replies).toHaveLength(2);
  });

  it('an immediate confirmation cancels an older poll and updates the real client hash', async () => {
    const { store, initial } = await loaded();
    const id = store.broadcasts()[0].id;
    const poll = store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    const confirmed = dto();
    confirmed.targets[0].confirmation = {
      confirmed_by_account_id: 's1',
      confirmed_by: 'Officer',
      role: 'Officer',
      confirmed_at: '2026-10-07T07:00:00Z',
    };
    const operation = store.confirm(id);
    http.expectOne('/api/broadcasts/b1/confirmations').flush(confirmed);
    expect(await operation).toBe(true);
    expect(pending!.cancelled).toBe(true);
    await poll;
    const expected = await syncFixture([confirmed]);
    const nextPoll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    expect(pending!.request.body.windows[0].hashes).toEqual(expected.windows[0].hashes);
    pending!.flush(unchanged(expected));
    await nextPoll;
    expect(store.pendingCount()).toBe(0);
  });

  it('loads a historical week on demand without counting it in the current badge', async () => {
    const { store } = await loaded();
    const historical = dto();
    historical.created_at = '2026-09-29T06:00:00Z';
    const response = await syncFixture([historical], '2026-W40', 'old-window');
    const loading = store.loadWeek('2026-W40');
    http.expectOne('/api/broadcasts/sync').flush(response);
    await loading;
    expect(store.weekLabel()).toBe('09/28 \u2014 10/04');
    expect(store.weeklyBroadcasts()).toHaveLength(1);
    expect(store.pendingCount()).toBe(0);
  });

  it('discards old scope state and identity-dependent drafts when the server changes group visibility', async () => {
    const { store } = await loaded();
    const fixture = TestBed.createComponent(BroadcastFeed);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const oldId = store.broadcasts()[0].id;
    component.drafts[oldId] = 'Private old-group draft';
    component.toggle(oldId);
    const next = dto();
    next.content = 'New group notice';
    next.targets[0].group_id = 'g2';
    const response = await syncFixture([next], '2026-W41', 'w2');
    response.scope_key = 'scope2';
    response.reset_required = true;
    response.reset_reason = 'scope';
    response.current_user.id = 's2';
    const poll = store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush(response);
    await poll;
    TestBed.tick();
    expect(store.broadcasts().map((b) => b.groupId)).toEqual(['g2']);
    expect(component.drafts).toEqual({});
    expect(component.expanded().size).toBe(0);
    const nextPoll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    expect(pending!.request.body.scope_key).toBe('scope2');
    expect(pending!.request.body.windows.map((w: { window_id: string }) => w.window_id)).toEqual([
      'w2',
    ]);
    pending!.flush({ ...unchanged(response), reset_required: false, reset_reason: null });
    await nextPoll;
    fixture.destroy();
  });

  it('clears the previous identity immediately after logout and ignores stale requests', async () => {
    const { store } = await loaded();
    const logout = TestBed.inject(AuthService).logout().subscribe();
    http.expectOne('/auth/logout').flush(null);
    TestBed.tick();
    expect(store.broadcasts()).toEqual([]);
    expect(store.currentUser().id).toBe('');
    logout.unsubscribe();
  });

  it('reinitializes after a schema mismatch and repairs corrupted membership', async () => {
    const { store, initial } = await loaded();
    let poll = store.poll();
    let pending;
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush({ ...initial, schema_version: 2 });
    await poll;
    poll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    expect(pending!.request.body.windows).toEqual([]);
    pending!.flush(initial);
    await poll;
    expect(store.broadcasts()).toHaveLength(1);
    poll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    pending!.flush({
      ...unchanged(initial),
      windows: [{ ...unchanged(initial).windows[0], member_ids: ['bad'] }],
    });
    await poll;
    poll = store.poll();
    await vi.waitFor(() => {
      pending = http.expectOne('/api/broadcasts/sync');
    });
    expect(pending!.request.body.windows).toEqual([]);
    pending!.flush(initial);
    await poll;
    expect(store.broadcasts()).toHaveLength(1);
  });
});
