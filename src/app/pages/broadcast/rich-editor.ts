import { Component, ElementRef, input, model, ViewChild } from '@angular/core';

@Component({
  selector: 'app-rich-editor',
  template: `
    <div class="toolbar" role="toolbar" aria-label="文字格式" (mousedown)="$event.preventDefault()">
      @for (tool of tools; track tool.label) {
        <button type="button" [disabled]="disabled()" (click)="format(tool.command, tool.value)">{{ tool.label }}</button>
      }
    </div>
    <div #editor class="editor broadcast-rich" role="textbox" aria-label="廣播內容" aria-multiline="true"
      [attr.contenteditable]="!disabled()" (input)="update()" (keyup)="remember()" (mouseup)="remember()"
      (blur)="remember()" (paste)="paste($event)" (drop)="$event.preventDefault()"><p><br></p></div>
    <div class="link-controls">
      <label>超連結網址 <input #url type="url" placeholder="https://…" [disabled]="disabled()" /></label>
      <button type="button" [disabled]="disabled()" (click)="link(url.value)">加入超連結</button>
    </div>
    <small role="status">{{ error }}</small>
  `,
  styles: `:host { display: block; min-width: 0; } .toolbar,.link-controls { display: flex; flex-wrap: wrap; gap: .4rem; }
    button,input { padding: .5rem; max-width: 100%; box-sizing: border-box; } .editor { border: 1px solid var(--campus-border);
    border-radius: .4rem; padding: 1rem; min-height: 14rem; overflow-wrap: anywhere; margin: .5rem 0; }
    .editor:focus { outline: 2px solid var(--campus-accent); } label { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; }`,
})
export class RichEditor {
  @ViewChild('editor', { static: true }) editor!: ElementRef<HTMLElement>;
  readonly disabled = input(false);
  readonly html = model('');
  readonly text = model('');
  error = '';
  private range: Range | null = null;
  readonly tools = [
    { label: '段落', command: 'formatBlock', value: 'p' },
    { label: '粗體', command: 'bold', value: '' },
    { label: '斜體', command: 'italic', value: '' },
    { label: '標題', command: 'formatBlock', value: 'h2' },
    { label: '有序清單', command: 'insertOrderedList', value: '' },
    { label: '無序清單', command: 'insertUnorderedList', value: '' },
  ];
  remember(): void {
    const selection = window.getSelection();
    if (selection?.rangeCount && this.editor.nativeElement.contains(selection.anchorNode))
      this.range = selection.getRangeAt(0).cloneRange();
  }
  format(command: string, value = ''): void {
    if (this.disabled()) return;
    this.editor.nativeElement.focus();
    if (this.range) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(this.range); }
    document.execCommand(command, false, value);
    this.update(); this.remember();
  }
  link(value: string): void {
    try {
      const url = new URL(value);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error();
      this.error = ''; this.format('createLink', url.href);
    } catch { this.error = '請輸入 http、https 或 mailto 網址。'; }
  }
  paste(event: ClipboardEvent): void {
    event.preventDefault();
    if (!this.disabled()) this.format('insertText', event.clipboardData?.getData('text/plain') ?? '');
  }
  update(): void {
    this.html.set(this.editor.nativeElement.innerHTML);
    this.text.set(this.editor.nativeElement.textContent ?? '');
  }
}
