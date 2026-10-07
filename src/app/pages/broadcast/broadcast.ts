import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BroadcastStore } from '../../services/broadcast/broadcast.store';
import { ReplyTree } from './reply-tree';

@Component({
  selector: 'app-broadcast',
  imports: [DatePipe, FormsModule, RouterLink, ReplyTree],
  templateUrl: './broadcast.html',
  styleUrl: './broadcast.scss',
})
export class BroadcastFeed {
  readonly store = inject(BroadcastStore);
  readonly expanded = signal(new Set<string>());
  readonly notice = signal('');
  drafts: Record<string, string> = {};

  toggle(id: string): void {
    this.expanded.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  confirm(id: string): void {
    this.store.confirm(id);
    this.notice.set('廣播已確認。');
  }

  submitReply(id: string): void {
    if (this.store.addReply(id, this.drafts[id] ?? '')) {
      this.drafts[id] = '';
      this.notice.set('回覆已送出。');
    }
  }
}
