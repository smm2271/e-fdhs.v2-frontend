import { Component, computed, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassDto } from '../../services/broadcast/teacher-broadcast.api';

@Component({
  selector: 'app-class-selector',
  imports: [FormsModule],
  template: `
    <label for="class-search">搜尋班級編號或名稱</label>
    <input id="class-search" type="search" [ngModel]="search()" (ngModelChange)="search.set($event)" [disabled]="disabled()" />
    <p aria-live="polite">已選取 {{ selected().size }} 個班級</p>
    <div class="grades">
      @for (grade of grades(); track grade.id) {
        <section class="grade">
          <div class="grade-heading">
            <input type="checkbox" [attr.aria-label]="'選取全年級：' + grade.name"
              [checked]="count(grade.classes) === grade.classes.length"
              [indeterminate]="count(grade.classes) > 0 && count(grade.classes) < grade.classes.length"
              [disabled]="disabled()" (change)="selectGrade(grade.classes, $any($event.target).checked)" />
            <button type="button" [attr.aria-expanded]="isOpen(grade.id)" [attr.aria-controls]="'grade-' + grade.id"
              (click)="toggle(grade.id)">{{ grade.name }} · {{ count(grade.classes) }}/{{ grade.classes.length }} {{ isOpen(grade.id) ? '▴' : '▾' }}</button>
          </div>
          @if (isOpen(grade.id)) {
            <div [id]="'grade-' + grade.id" class="classes">
              @for (group of visible(grade.classes); track group.id) {
                <label><input type="checkbox" [checked]="selected().has(group.id)" [disabled]="disabled()"
                  (change)="selectClass(group.id, $any($event.target).checked)" />{{ group.name }}</label>
              } @empty { <p>此年級沒有符合搜尋的班級</p> }
            </div>
          }
        </section>
      } @empty { <p>目前沒有可發布的班級。</p> }
    </div>
    <details><summary>查看完整已選班級（{{ selected().size }}）</summary>
      <ul>@for (group of selectedClasses(); track group.id) { <li>{{ group.grade_name }} · {{ group.name }}</li> }</ul>
    </details>
  `,
  styles: `:host { display: block; } input[type=search] { width: 100%; box-sizing: border-box; padding: .7rem; }
    .grades { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,260px),1fr)); gap: .8rem; }
    .grade { border: 1px solid #d3dce3; border-radius: .5rem; min-width: 0; }
    .grade-heading { display: flex; align-items: center; padding: .4rem; }
    button { border: 0; background: transparent; padding: .6rem; text-align: left; flex: 1; cursor: pointer; }
    .classes { display: grid; gap: .4rem; padding: .7rem; }
    label { display: flex; gap: .5rem; align-items: center; min-height: 2rem; }
    details { margin-top: 1rem; } summary { cursor: pointer; } input[type=checkbox] { width: 1.2rem; height: 1.2rem; }
    @media(max-width:600px) { .grades { grid-template-columns: 1fr; } }
  `,
})
export class ClassSelector {
  readonly classes = input.required<ClassDto[]>();
  readonly disabled = input(false);
  readonly selected = model(new Set<string>());
  readonly search = signal('');
  readonly opened = signal(new Set<string>());
  readonly grades = computed(() => {
    const groups = new Map<string, { id: string; name: string; classes: ClassDto[] }>();
    for (const group of this.classes()) {
      const id = group.grade_id ?? 'unassigned';
      if (!groups.has(id)) groups.set(id, { id, name: group.grade_name, classes: [] });
      groups.get(id)!.classes.push(group);
    }
    return [...groups.values()];
  });
  readonly selectedClasses = computed(() => this.classes().filter(g => this.selected().has(g.id)));
  visible(groups: ClassDto[]): ClassDto[] {
    const query = this.search().trim().toLocaleLowerCase();
    return groups.filter(g => g.name.toLocaleLowerCase().includes(query));
  }
  isOpen(id: string): boolean { return this.opened().has(id) || !!this.search().trim(); }
  toggle(id: string): void {
    this.opened.update(ids => { const next = new Set(ids); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  count(groups: ClassDto[]): number { return groups.filter(g => this.selected().has(g.id)).length; }
  selectClass(id: string, checked: boolean): void {
    if (this.disabled()) return;
    this.selected.update(ids => { const next = new Set(ids); checked ? next.add(id) : next.delete(id); return next; });
  }
  selectGrade(groups: ClassDto[], checked: boolean): void {
    if (this.disabled()) return;
    this.selected.update(ids => {
      const next = new Set(ids);
      for (const g of groups) checked ? next.add(g.id) : next.delete(g.id);
      return next;
    });
  }
}
