import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { createMockBroadcasts, MOCK_NOW, MOCK_USERS } from './broadcast.mock';
import { Broadcast, BroadcastReply } from './broadcast.types';

export const BROADCAST_CLOCK = new InjectionToken<() => Date>('Broadcast clock', {
  providedIn: 'root',
  factory: () => () => new Date(MOCK_NOW),
});

// The page consumes this store only. Replace the mock initialization/mutations here with
// service calls when the real API is available; no transport contract is assumed.
@Injectable({ providedIn: 'root' })
export class BroadcastStore {
  readonly now = inject(BROADCAST_CLOCK);
  private readonly state = signal(createMockBroadcasts());
  readonly broadcasts = this.state.asReadonly();
  private readonly user = signal(MOCK_USERS[0]);
  readonly currentUser = this.user.asReadonly();
  readonly users = MOCK_USERS;
  private replySequence = 0;
  readonly weekLabel = computed(() => {
    const date = this.dateKey(this.now().toISOString());
    const start = new Date(`${date}T12:00:00+08:00`);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    start.setUTCDate(start.getUTCDate() - ((weekday + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return `${this.dateKey(start.toISOString()).slice(5).replace('-', '/')} — ${this.dateKey(end.toISOString()).slice(5).replace('-', '/')}`;
  });
  readonly weeklyBroadcasts = computed(() => {
    const today = this.dateKey(this.now().toISOString());
    const start = new Date(`${today}T00:00:00+08:00`);
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    start.setUTCDate(start.getUTCDate() - ((weekday + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return this.broadcasts()
      .filter((b) => new Date(b.sentAt) >= start && new Date(b.sentAt) < end)
      .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
  });
  readonly pendingCount = computed(() =>
    this.currentUser().canConfirm
      ? this.weeklyBroadcasts().filter((b) => !b.confirmation).length
      : 0,
  );
  readonly groups = computed(() => {
    const groups: { date: string; label: string; broadcasts: Broadcast[] }[] = [];
    for (const broadcast of this.weeklyBroadcasts()) {
      const date = this.dateKey(broadcast.sentAt);
      let group = groups.find((g) => g.date === date);
      if (!group) {
        group = { date, label: this.dateLabel(date), broadcasts: [] };
        groups.push(group);
      }
      group.broadcasts.push(broadcast);
    }
    return groups;
  });

  setUser(id: string): void {
    const user = this.users.find((u) => u.id === id);
    if (user) this.user.set(user);
  }

  isOverdue(broadcast: Broadcast): boolean {
    return (
      Date.parse(broadcast.confirmation?.confirmedAt ?? this.now().toISOString()) >
      Date.parse(broadcast.confirmationDueAt)
    );
  }

  confirm(id: string): void {
    if (!this.currentUser().canConfirm) return;
    this.state.update((items) =>
      items.map((b) =>
        b.id === id && !b.confirmation && this.weeklyBroadcasts().some((w) => w.id === id)
          ? {
              ...b,
              confirmation: {
                confirmedAt: this.now().toISOString(),
                confirmedBy: this.currentUser().name,
                role: this.currentUser().role,
              },
            }
          : b,
      ),
    );
  }

  addReply(id: string, content: string): boolean {
    if (
      !this.currentUser().canReply ||
      !content.trim() ||
      !this.weeklyBroadcasts().some((b) => b.id === id)
    )
      return false;
    const reply: BroadcastReply = {
      id: `mock-reply-${++this.replySequence}`,
      authorName: `${this.currentUser().name} · ${this.currentUser().role}`,
      createdAt: this.now().toISOString(),
      content: content.trim(),
      replies: [],
    };
    this.state.update((items) =>
      items.map((b) => (b.id === id ? { ...b, replies: [...b.replies, reply] } : b)),
    );
    return true;
  }

  replyCount(replies: BroadcastReply[]): number {
    return replies.reduce((total, reply) => total + 1 + this.replyCount(reply.replies), 0);
  }

  dateKey(value: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  }

  private dateLabel(date: string): string {
    const yesterday = new Date(this.now());
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const prefix =
      date === this.dateKey(this.now().toISOString())
        ? '今天'
        : date === this.dateKey(yesterday.toISOString())
          ? '昨天'
          : new Intl.DateTimeFormat('zh-TW', { weekday: 'long', timeZone: 'Asia/Taipei' }).format(
              new Date(`${date}T12:00:00+08:00`),
            );
    return `${prefix} · ${date.slice(5).replace('-', '/')}`;
  }
}
