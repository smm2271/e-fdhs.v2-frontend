import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BROADCAST_MOCK } from '../../services/broadcast/broadcast.store';
import { BroadcastFeed } from './broadcast';

describe('BroadcastFeed', () => {
  let fixture: ComponentFixture<BroadcastFeed>;
  let element: HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BroadcastFeed],
      providers: [provideRouter([]), { provide: BROADCAST_MOCK, useValue: true }],
    }).compileComponents();
    fixture = TestBed.createComponent(BroadcastFeed);
    await fixture.whenStable();
    element = fixture.nativeElement;
  });

  it('renders one table, three date separators and the complete long content', () => {
    expect(element.querySelectorAll('table')).toHaveLength(1);
    expect(element.querySelectorAll('.date-row')).toHaveLength(3);
    expect(element.querySelectorAll('.broadcast-row')).toHaveLength(5);
    expect(element.querySelectorAll('.content')[1].textContent).toBe(
      fixture.componentInstance.store.weeklyBroadcasts()[1].content,
    );
    expect(element.querySelectorAll('thead th')).toHaveLength(5);
  });

  it('confirms immediately and updates the nav badge, including late confirmation', async () => {
    (element.querySelector('.confirm-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(element.querySelector('.badge')?.textContent?.trim()).toBe('1');
    expect(element.querySelector('.confirmation')?.textContent).toContain('✓ 已確認');
    (element.querySelector('.confirm-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(element.querySelector('.badge')).toBeNull();
    expect(element.querySelectorAll('.confirmation')[2].textContent).toContain('! 逾期確認');
  });

  it('expands the nested tree inline and collapses through the same button', async () => {
    const toggle = element.querySelectorAll<HTMLButtonElement>('.reply-toggle')[1];
    const row = element.querySelectorAll<HTMLTableRowElement>('.reply-row')[1];
    expect(row.hidden).toBe(true);
    toggle.click();
    await fixture.whenStable();
    expect(row.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(row.querySelectorAll('li')).toHaveLength(3);
    toggle.click();
    await fixture.whenStable();
    expect(row.hidden).toBe(true);
  });

  it('submits a reply from the input and updates its count without closing the thread', async () => {
    (element.querySelector('.reply-toggle') as HTMLButtonElement).click();
    await fixture.whenStable();
    const input = element.querySelector('textarea')!;
    input.value = '已收到通知';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    element
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(element.querySelector('.reply-toggle')?.textContent).toContain('回覆 1');
    expect(element.querySelector('.reply-row')?.textContent).toContain('已收到通知');
    expect(input.value).toBe('');
    expect(element.querySelector<HTMLTableRowElement>('.reply-row')!.hidden).toBe(false);
  });

  it('shows responsibility controls for both officers and hides them for students', async () => {
    fixture.componentInstance.store.setUser('student-2');
    await fixture.whenStable();
    expect(element.querySelectorAll('.confirm-button')).toHaveLength(2);
    expect(element.querySelector('textarea')).toBeTruthy();
    fixture.componentInstance.store.setUser('student-3');
    await fixture.whenStable();
    expect(element.querySelector('.confirm-button')).toBeNull();
    expect(element.querySelector('textarea')).toBeNull();
    expect(element.querySelector('.badge')).toBeNull();
    expect(element.querySelector('.confirmation')?.textContent).toContain('未確認');
    (element.querySelectorAll('.reply-toggle')[1] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(element.querySelectorAll('.reply-row')[1].querySelectorAll('li')).toHaveLength(3);
  });
});
