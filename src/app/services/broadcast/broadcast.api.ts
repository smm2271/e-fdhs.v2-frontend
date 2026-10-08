import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Broadcast, BroadcastReply, BroadcastUser } from './broadcast.types';

interface ReplyDto {
  id: string;
  author_name: string;
  role: string;
  created_at: string;
  content: string;
  replies: ReplyDto[];
}
export interface BroadcastDto {
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
    confirmation: { confirmed_at: string; confirmed_by: string; role: string } | null;
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

  async confirm(b: Broadcast): Promise<Broadcast[]> {
    const dto = await firstValueFrom(
      this.http.post<BroadcastDto>(
        `/api/broadcasts/${b.broadcastId}/confirmations`,
        { group_id: b.groupId },
        { withCredentials: true },
      ),
    );
    return mapBroadcast(dto);
  }

  async reply(b: Broadcast, content: string, refId?: string): Promise<Broadcast[]> {
    const dto = await firstValueFrom(
      this.http.post<BroadcastDto>(
        `/api/broadcasts/${b.broadcastId}/replies`,
        { content, group_id: b.groupId, ref_id: refId ?? null },
        { withCredentials: true },
      ),
    );
    return mapBroadcast(dto);
  }
}
