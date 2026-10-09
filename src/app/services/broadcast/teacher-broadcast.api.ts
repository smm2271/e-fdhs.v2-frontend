import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, fromEvent, takeUntil } from 'rxjs';
import { BroadcastDto } from './broadcast.api';

export interface ClassDto { id: string; name: string; grade_id: string | null; grade_name: string; }
export interface PublishDto { content: string; content_format: 'html'; target_group_ids: string[]; }

@Injectable({ providedIn: 'root' })
export class TeacherBroadcastApi {
  private readonly http = inject(HttpClient);
  classes(): Promise<ClassDto[]> {
    return firstValueFrom(this.http.get<ClassDto[]>('/api/broadcasts/classes', { withCredentials: true }));
  }
  publish(payload: PublishDto, key: string): Promise<BroadcastDto> {
    return firstValueFrom(this.http.post<BroadcastDto>('/api/broadcasts', payload,
      { withCredentials: true, headers: { 'Idempotency-Key': key } }));
  }
  async mine(signal: AbortSignal): Promise<BroadcastDto[]> {
    const items: BroadcastDto[] = [];
    for (let offset = 0; ; offset += 100) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const page = await firstValueFrom(this.http.get<BroadcastDto[]>('/api/broadcasts/mine',
        { withCredentials: true, params: { limit: 100, offset } }).pipe(takeUntil(fromEvent(signal, 'abort'))));
      items.push(...page);
      if (page.length < 100) return [...new Map(items.map(item => [item.id, item])).values()];
    }
  }
}
