import { TestBed } from '@angular/core/testing';
import { BROADCAST_MOCK, BROADCAST_CLOCK, BroadcastStore } from './broadcast.store';

describe('BroadcastStore', () => {
  let store: BroadcastStore;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: BROADCAST_MOCK, useValue: true }] });
    store = TestBed.inject(BroadcastStore);
  });

  it('groups this week newest first and excludes historical pending broadcasts', () => {
    expect(store.groups().map((g) => g.label)).toEqual([
      '今天 · 10/07',
      '昨天 · 10/06',
      '星期一 · 10/05',
    ]);
    expect(store.weeklyBroadcasts().map((b) => b.id)).toEqual([
      'today-1',
      'today-2',
      'yesterday-1',
      'monday-1',
      'monday-2',
    ]);
    expect(store.pendingCount()).toBe(2);
    store.confirm('today-1');
    store.confirm('yesterday-1');
    expect(store.pendingCount()).toBe(0);
    expect(store.broadcasts().find((b) => b.id === 'last-week')?.confirmation).toBeNull();
  });

  it('records the confirmer and distinguishes late confirmation without overwriting it', () => {
    store.confirm('today-1');
    expect(store.isOverdue(store.weeklyBroadcasts()[0])).toBe(false);
    store.setUser('student-2');
    store.confirm('today-1');
    expect(store.weeklyBroadcasts()[0].confirmation?.role).toBe('資訊股長');
    store.confirm('yesterday-1');
    const late = store.weeklyBroadcasts().find((b) => b.id === 'yesterday-1')!;
    expect(late.confirmation?.role).toBe('班代表');
    expect(store.isOverdue(late)).toBe(true);
  });

  it('enforces read-only permissions in the state layer', () => {
    store.setUser('student-3');
    expect(store.pendingCount()).toBe(0);
    store.confirm('today-1');
    expect(store.weeklyBroadcasts()[0].confirmation).toBeNull();
    expect(store.addReply('today-1', '不應新增')).toBe(false);
    expect(store.weeklyBroadcasts()[0].replies).toHaveLength(0);
  });

  it('counts nested replies and appends only nonempty replies to valid broadcasts', () => {
    expect(store.replyCount(store.weeklyBroadcasts()[1].replies)).toBe(3);
    expect(store.addReply('today-1', '  ')).toBe(false);
    expect(store.addReply('unknown', '回覆')).toBe(false);
    expect(store.addReply('last-week', '回覆')).toBe(false);
    expect(store.addReply('today-1', '  收到\n謝謝  ')).toBe(true);
    expect(store.weeklyBroadcasts()[0].replies[0].content).toBe('收到\n謝謝');
    expect(store.replyCount(store.weeklyBroadcasts()[0].replies)).toBe(1);
  });
});

describe('Broadcast week boundaries (Taipei)', () => {
  it('keeps the same week through Sunday night in Taipei', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: BROADCAST_MOCK, useValue: true },
        { provide: BROADCAST_CLOCK, useValue: () => new Date('2026-10-11T23:59:59+08:00') },
      ],
    });
    const store = TestBed.inject(BroadcastStore);
    expect(store.weeklyBroadcasts()).toHaveLength(5);
    expect(store.weekLabel()).toBe('10/05 — 10/11');
  });
  it('does not keep the badge lit for last week at the new week boundary', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: BROADCAST_MOCK, useValue: true },
        { provide: BROADCAST_CLOCK, useValue: () => new Date('2026-10-12T00:00:00+08:00') },
      ],
    });
    const store = TestBed.inject(BroadcastStore);
    expect(store.weeklyBroadcasts()).toHaveLength(0);
    expect(store.pendingCount()).toBe(0);
  });
});
