import {
  computed,
  effect,
  DestroyRef,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  signal,
} from '@angular/core';
import { createMockBroadcasts, MOCK_NOW, MOCK_USERS } from './broadcast.mock';
import { environment } from '../../../environments/environment';
import { BroadcastApi, mapBroadcast } from './broadcast.api';
import { BroadcastSyncClient } from './broadcast.sync';
import { isoWeek } from './broadcast.hash';
import { AuthService } from '../auth.service';
import { Broadcast, BroadcastReply } from './broadcast.types';

export const BROADCAST_MOCK = new InjectionToken<boolean>('Broadcast mock mode', {
  providedIn: 'root',
  factory: () => !environment.production && environment.broadcastMock,
});

export const BROADCAST_POLL_MS = new InjectionToken<number>('Broadcast poll milliseconds', {
  providedIn: 'root',
  factory: () => (environment.production ? 30000 : environment.broadcastPollMs),
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
  private readonly syncClient = new BroadcastSyncClient();
  readonly syncing = signal(false);
  readonly identityGeneration = signal(0);
  private readonly pollMs = inject(BROADCAST_POLL_MS);
  private timer: ReturnType<typeof setInterval> | undefined;
  private controller: AbortController | null = null;
  private initialized = false;
  private active = false;
  private readonly selectedWeek = signal<string | null>(null);
  private identityEpoch = 0;

  constructor() {
    if (!this.mockMode) {
      const auth = this.injector.get(AuthService);
      let revision = auth.identityRevision();
      effect(() => {
        const next = auth.identityRevision();
        if (revision !== next) {
          revision = next;
          this.clearPrivateData();
          if (this.active) void this.load();
        }
      });
      void this.load();
      inject(DestroyRef).onDestroy(() => this.stopPolling());
    }
  }

  startPolling(): void {
    if (this.mockMode || this.active) return;
    this.active = true;
    this.timer = setInterval(() => {
      this.clockTick.update((tick) => tick + 1);
      void this.poll();
    }, this.pollMs);
    if (!this.initialized && !this.loading()) void this.load();
  }

  stopPolling(): void {
    this.active = false;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.cancelSync();
  }

  private cancelSync(): void {
    this.controller?.abort();
    this.controller = null;
    this.syncing.set(false);
    this.loading.set(false);
  }

  private clearPrivateData(): void {
    this.cancelSync();
    this.syncClient.clear();
    this.initialized = false;
    this.identityEpoch++;
    this.busy.set(new Set());
    this.identityGeneration.update((value) => value + 1);
    this.state.set([]);
    this.apiPending.set(0);
    this.user.set({ id: '', name: '', role: '', canConfirm: false, canReply: false });
  }

  async load(): Promise<void> {
    if (this.mockMode || this.syncing() || this.busy().size) return;
    await this.poll();
  }

  async loadWeek(week: string | null): Promise<void> {
    if (this.mockMode) return;
    this.selectedWeek.set(week);
    this.cancelSync();
    this.syncClient.clear();
    this.initialized = false;
    this.state.set([]);
    this.apiPending.set(0);
    await this.load();
  }

  async poll(): Promise<void> {
    if (this.mockMode || this.syncing() || this.busy().size) return;
    const week = this.selectedWeek() ?? isoWeek(this.now());
    if (this.syncClient.week !== null && this.syncClient.week !== week) {
      this.syncClient.clear();
      this.initialized = false;
      this.state.set([]);
      this.apiPending.set(0);
    }
    const controller = new AbortController();
    this.controller = controller;
    this.syncing.set(true);
    this.loading.set(!this.initialized);
    try {
      const result = await this.syncClient.synchronize(
        this.injector.get(BroadcastApi),
        week,
        controller.signal,
        () => {
          this.syncClient.clear();
          this.state.set([]);
          this.user.set({ id: '', name: '', role: '', canConfirm: false, canReply: false });
          this.apiPending.set(0);
          this.identityEpoch++;
          this.identityGeneration.update((value) => value + 1);
        },
      );
      if (controller.signal.aborted || this.controller !== controller) return;
      if (result.changed) {
        this.state.update((items) =>
          result.rows.map((row) => {
            const previous = items.find((item) => item.id === row.id);
            if (!previous) return row;
            if (JSON.stringify(previous) === JSON.stringify(row)) return previous;
            return {
              ...row,
              replies:
                JSON.stringify(previous.replies) === JSON.stringify(row.replies)
                  ? previous.replies
                  : row.replies,
              confirmation:
                JSON.stringify(previous.confirmation) === JSON.stringify(row.confirmation)
                  ? previous.confirmation
                  : row.confirmation,
            };
          }),
        );
      }
      if (JSON.stringify(result.user) !== JSON.stringify(this.user())) this.user.set(result.user);
      this.updatePending();
      this.initialized = true;
      this.error.set('');
    } catch (error) {
      if (controller.signal.aborted || this.controller !== controller) return;
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        this.clearPrivateData();
        if (status === 401) this.stopPolling();
      } else if (error instanceof Error && /schema|membership|Incomplete/.test(error.message)) {
        this.syncClient.clear();
        this.initialized = false;
      }
      if (status === 409) this.error.set('同步期間資料已更新，下次輪詢會重新取得。');
      else this.showError(error);
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        this.syncing.set(false);
        this.loading.set(false);
      }
    }
  }

  private updatePending(): void {
    const currentWeek = isoWeek(this.now());
    this.apiPending.set(
      this.state().filter(
        (b) => this.canConfirm(b) && !b.confirmation && isoWeek(new Date(b.sentAt)) === currentWeek,
      ).length,
    );
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
    const epoch = this.identityEpoch;
    try {
      const api = this.injector.get(BroadcastApi);
      const dto =
        operation === 'confirm' ? await api.confirmRaw(b) : await api.replyRaw(b, content);
      if (epoch !== this.identityEpoch) return false;
      this.cancelSync();
      this.syncClient.acceptMutation(dto);
      const updated = mapBroadcast(dto);
      this.state.update((items) =>
        items.map((item) => updated.find((next) => next.id === item.id) ?? item),
      );
      this.updatePending();
      return true;
    } catch (error) {
      if (epoch === this.identityEpoch) this.showError(error);
      return false;
    } finally {
      if (epoch === this.identityEpoch)
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
    const selected = this.selectedWeek();
    if (!this.mockMode && selected && /^\d{4}-W\d{2}$/.test(selected)) {
      const year = Number(selected.slice(0, 4));
      const week = Number(selected.slice(6));
      const monday = new Date(Date.UTC(year, 0, 4));
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + (week - 1) * 7);
      const sunday = new Date(monday);
      sunday.setUTCDate(sunday.getUTCDate() + 6);
      return `${this.dateKey(monday.toISOString()).slice(5).replace('-', '/')} \u2014 ${this.dateKey(sunday.toISOString()).slice(5).replace('-', '/')}`;
    }
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
    if (!this.mockMode)
      return [...this.broadcasts()].sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
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
