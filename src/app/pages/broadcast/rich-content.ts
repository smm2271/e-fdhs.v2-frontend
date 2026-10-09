import { Component, input } from '@angular/core';

export const RICH_PREFIX = 'broadcast-html-v1:\n';

@Component({
  selector: 'app-rich-content',
  template: `@if (content().startsWith(prefix)) {
    <div class="rich broadcast-rich" [innerHTML]="content().slice(prefix.length)"></div>
  } @else { <div class="plain">{{ content() }}</div> }`,
  styles: `:host { display: block; min-width: 0; overflow-wrap: anywhere; }
    .plain { white-space: pre-wrap; } .rich { white-space: normal; }
    .rich { overflow-wrap: anywhere; }`,
})
export class RichContent {
  readonly content = input.required<string>();
  readonly prefix = RICH_PREFIX;
}
