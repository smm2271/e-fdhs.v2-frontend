import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { BroadcastReply } from '../../services/broadcast/broadcast.types';

@Component({
  selector: 'app-reply-tree',
  imports: [DatePipe],
  template: `
    <ul aria-label="回覆">
      @for (reply of replies(); track reply.id) {
        <li>
          <div class="meta">
            <strong>{{ reply.authorName }}</strong
            ><time [attr.datetime]="reply.createdAt">{{
              reply.createdAt | date: 'MM/dd HH:mm' : '+0800'
            }}</time>
          </div>
          <p>{{ reply.content }}</p>
          @if (reply.replies.length) {
            <app-reply-tree [replies]="reply.replies" />
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    li {
      padding: 0.75rem 0;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      font-size: 0.875rem;
    }
    strong {
      font-weight: bold;
    }
    time {
      color: #595959;
    }
    p {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      line-height: 1.7;
      margin-top: 0.375rem;
    }
    app-reply-tree {
      margin: 0.5rem 0 0 0.75rem;
      padding-left: 0.75rem;
      border-left: 1px solid #aaa;
    }
    @media (max-width: 768px) {
      app-reply-tree {
        margin-left: 0.375rem;
        padding-left: 0.5rem;
      }
    }
  `,
})
export class ReplyTree {
  readonly replies = input.required<BroadcastReply[]>();
}
