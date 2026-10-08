import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, fromEvent, Observable, takeUntil } from 'rxjs';
import { SyncRequest, SyncResponse, ChunkResponse, Layer } from './broadcast.sync.types';
import { Broadcast, BroadcastReply, BroadcastUser } from './broadcast.types';

export interface ReplyDto {
  ref_id?: string | null;
  author_id?: string;
  id: string;
  author_name: string;
  role: string;
  created_at: string;
  content: string;
  replies: ReplyDto[];
}
export interface BroadcastDto {
  author_id?: string;
  id: string;
  sender_name: string;
  created_at: string;
  content: string;
  ack_deadline_at: string;
  targets: {
    group_id: string;
    group_name: string;
    can_confirm: boolean;
    can_reply: boolean;
    confirmation_state: Broadcast['confirmationState'];
    confirmation: {
      confirmed_by_account_id?: string;
      confirmed_at: string;
      confirmed_by: string;
      role: string;
    } | null;
    replies: ReplyDto[];
    reply_count: number;
  }[];
}
interface FeedDto {
  items: BroadcastDto[];
  current_user: {
    id: string;
    name: string;
    role: string;
    can_confirm: boolean;
    can_reply: boolean;
  };
  pending_count: number;
}

export function mapBroadcast(dto: BroadcastDto): Broadcast[] {
  const reply = (r: ReplyDto): BroadcastReply => ({
    id: r.id,
    authorName: `${r.author_name} · ${r.role}`,
    createdAt: r.created_at,
    content: r.content,
    replies: r.replies.map(reply),
  });
  return dto.targets.map((t) => ({
    id: `${dto.id}:${t.group_id}`,
    broadcastId: dto.id,
    groupId: t.group_id,
    senderName: `${dto.sender_name} · ${t.group_name}`,
    sentAt: dto.created_at,
    content: dto.content,
    confirmationDueAt: dto.ack_deadline_at,
    confirmationState: t.confirmation_state,
    canConfirm: t.can_confirm,
    canReply: t.can_reply,
    confirmation: t.confirmation
      ? {
          confirmedAt: t.confirmation.confirmed_at,
          confirmedBy: t.confirmation.confirmed_by,
          role: t.confirmation.role,
        }
      : null,
    replies: t.replies.map(reply),
  }));
}

@Injectable({ providedIn: 'root' })
export class BroadcastApi {
  private readonly http = inject(HttpClient);

  async feed(): Promise<{ items: Broadcast[]; user: BroadcastUser; pendingCount: number }> {
    const items: Broadcast[] = [];
    let first: FeedDto | undefined;
    for (let offset = 0; ; offset += 100) {
      const page = await firstValueFrom(
        this.http.get<FeedDto>('/api/broadcasts', {
          withCredentials: true,
          params: { limit: 100, offset },
        }),
      );
      first ??= page;
      items.push(...page.items.flatMap(mapBroadcast));
      if (page.items.length < 100) break;
    }
    return {
      items,
      user: {
        id: first.current_user.id,
        name: first.current_user.name,
        role: first.current_user.role,
        canConfirm: first.current_user.can_confirm,
        canReply: first.current_user.can_reply,
      },
      pendingCount: first.pending_count,
    };
  }

  private request<T>(request: Observable<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    return firstValueFrom(signal ? request.pipe(takeUntil(fromEvent(signal, 'abort'))) : request);
  }

  sync(payload: SyncRequest, signal?: AbortSignal): Promise<SyncResponse> {
    return this.request(
      this.http.post<SyncResponse>('/api/broadcasts/sync', payload, { withCredentials: true }),
      signal,
    );
  }

  chunk(
    windowId: string,
    layer: Layer,
    week: string,
    hash: string,
    offset: number,
    scope: string,
    signal?: AbortSignal,
  ): Promise<ChunkResponse> {
    return this.request(
      this.http.get<ChunkResponse>(`/api/broadcasts/sync/windows/${windowId}/layers/${layer}`, {
        withCredentials: true,
        params: { week, expected_hash: hash, offset, scope_key: scope },
      }),
      signal,
    );
  }

  confirmRaw(b: Broadcast): Promise<BroadcastDto> {
    return firstValueFrom(
      this.http.post<BroadcastDto>(
        `/api/broadcasts/${b.broadcastId}/confirmations`,
        { group_id: b.groupId },
        { withCredentials: true },
      ),
    );
  }
  replyRaw(b: Broadcast, content: string, refId?: string): Promise<BroadcastDto> {
    return firstValueFrom(
      this.http.post<BroadcastDto>(
        `/api/broadcasts/${b.broadcastId}/replies`,
        { content, group_id: b.groupId, ref_id: refId ?? null },
        { withCredentials: true },
      ),
    );
  }
  async confirm(b: Broadcast): Promise<Broadcast[]> {
    return mapBroadcast(await this.confirmRaw(b));
  }
  async reply(b: Broadcast, content: string, refId?: string): Promise<Broadcast[]> {
    return mapBroadcast(await this.replyRaw(b, content, refId));
  }
}
