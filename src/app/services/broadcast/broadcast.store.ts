import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  signal,
} from '@angular/core';
import { createMockBroadcasts, MOCK_NOW, MOCK_USERS } from './broadcast.mock';
import { environment } from '../../../environments/environment';
import { BroadcastApi } from './broadcast.api';
import { Broadcast, BroadcastReply } from './broadcast.types';

export const BROADCAST_MOCK = new InjectionToken<boolean>('Broadcast mock mode', {
  providedIn: 'root',
  factory: () => !environment.production && environment.broadcastMock,
});

export const BROADCAST_CLOCK = new InjectionToken<() => Date>('Broadcast clock', {
  providedIn: 'root',
  factory: () => (inject(BROADCAST_MOCK) ? () => new Date(MOCK_NOW) : () => new Date()),
});

// The same feed UI supports explicit development mocks and session-authenticated API data.
@Injectable({ providedIn: 'root' })
export class BroadcastStore {
  readonly mockMode = inject(BROADCAST_MOCK);
  private readonly injector = inject(Injector);
  private readonly clock = inject(BROADCAST_CLOCK);
  private readonly clockTick = signal(0);
  readonly now = () => {
    this.clockTick();
    return this.clock();
  };
  readonly loading = signal(false);
  readonly error = signal('');
  readonly busy = signal(new Set<string>());
  private readonly apiPending = signal(0);
  private loadedWeek = '';

  constructor() {
    if (!this.mockMode) {
      void this.load();
      const timer = setInterval(() => {
        this.clockTick.update((tick) => tick + 1);
        if (this.weekLabel() !== this.loadedWeek) void this.load();
      }, 60000);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  async load(): Promise<void> {
    if (this.mockMode || this.loading() || this.busy().size) return;
    this.loadedWeek = this.weekLabel();
    this.loading.set(true);
    this.error.set('');
    this.state.set([]);
    this.user.set({ id: '', name: '', role: '', canConfirm: false, canReply: false });
    this.apiPending.set(0);
    try {
      const feed = await this.injector.get(BroadcastApi).feed();
      this.state.set(feed.items);
      this.user.set(feed.user);
      this.apiPending.set(feed.pendingCount);
    } catch (error) {
      this.showError(error);
    } finally {
      this.loading.set(false);
    }
  }

  canConfirm(b: Broadcast): boolean {
    return b.canConfirm ?? this.currentUser().canConfirm;
  }
  canReply(b: Broadcast): boolean {
    return b.canReply ?? this.currentUser().canReply;
  }

  private showError(error: unknown): void {
    const status = (error as { status?: number }).status;
    this.error.set(
      status === 401
        ? '請先登入，再讀取廣播。'
        : status === 403
          ? '目前帳號沒有這項操作權限。'
          : status === 409
            ? '這則廣播已由其他人確認，請重新載入。'
            : '廣播操作失敗，請重試。',
    );
  }

  private async mutate(id: string, operation: 'confirm' | 'reply', content = ''): Promise<boolean> {
    const b = this.broadcasts().find((item) => item.id === id);
    if (
      !b ||
      this.busy().has(id) ||
      (operation === 'confirm' ? !this.canConfirm(b) || !!b.confirmation : !this.canReply(b))
    )
      return false;
    this.busy.update((ids) => new Set([...ids, id]));
    this.error.set('');
    try {
      const api = this.injector.get(BroadcastApi);
      const updated = operation === 'confirm' ? await api.confirm(b) : await api.reply(b, content);
      this.state.update((items) =>
        items.map((item) => updated.find((next) => next.id === item.id) ?? item),
      );
      if (operation === 'confirm' && this.weeklyBroadcasts().some((item) => item.id === id)) {
        this.apiPending.update((count) => Math.max(0, count - 1));
      }
      return true;
    } catch (error) {
      this.showError(error);
      return false;
    } finally {
      this.busy.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  }
  private readonly state = signal<Broadcast[]>(this.mockMode ? createMockBroadcasts() : []);
  readonly broadcasts = this.state.asReadonly();
  private readonly user = signal(
    this.mockMode
      ? MOCK_USERS[0]
      : { id: '', name: '', role: '', canConfirm: false, canReply: false },
  );
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
    !this.mockMode
      ? this.apiPending()
      : this.currentUser().canConfirm
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
    if (!this.mockMode) return;
    const user = this.users.find((u) => u.id === id);
    if (user) this.user.set(user);
  }

  isOverdue(broadcast: Broadcast): boolean {
    return (
      Date.parse(broadcast.confirmation?.confirmedAt ?? this.now().toISOString()) >
      Date.parse(broadcast.confirmationDueAt)
    );
  }

  confirm(id: string): boolean | Promise<boolean> {
    if (!this.mockMode) return this.mutate(id, 'confirm');
    if (!this.currentUser().canConfirm) return false;
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
    return true;
  }

  addReply(id: string, content: string): boolean | Promise<boolean> {
    if (!this.mockMode) return content.trim() ? this.mutate(id, 'reply', content.trim()) : false;
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
