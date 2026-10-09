import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TeacherBroadcastApi } from './teacher-broadcast.api';

describe('Teacher broadcast API contract', () => {
  let api: TeacherBroadcastApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(TeacherBroadcastApi); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('fetches backend classes with cookie credentials', async () => {
    const result = api.classes(); const request = http.expectOne('/api/broadcasts/classes');
    expect(request.request.withCredentials).toBe(true);
    request.flush([{ id: 'class-uuid', name: '101', grade_id: 'grade-uuid', grade_name: '一年級' }]);
    expect((await result)[0].id).toBe('class-uuid');
  });
  it('sends HTML format, stable group IDs and an operation idempotency key', async () => {
    const payload = { content: '<p>Hello</p>', content_format: 'html' as const, target_group_ids: ['class-uuid'] };
    const result = api.publish(payload, 'key-uuid'); const request = http.expectOne('/api/broadcasts');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual(payload);
    expect(request.request.headers.get('Idempotency-Key')).toBe('key-uuid');
    expect(request.request.withCredentials).toBe(true); request.flush({ id: 'new-id' });
    expect((await result).id).toBe('new-id');
  });
  it('pages author-scoped history and aborts active requests on destruction', async () => {
    const controller = new AbortController(); const result = api.mine(controller.signal);
    const request = http.expectOne(r => r.url === '/api/broadcasts/mine' && r.params.get('offset') === '0');
    request.flush(Array.from({ length: 100 }, (_, i) => ({ id: String(i) })));
    await Promise.resolve(); await Promise.resolve();
    const next = http.expectOne(r => r.url === '/api/broadcasts/mine' && r.params.get('offset') === '100');
    expect(next.request.withCredentials).toBe(true); next.flush([{ id: 'last' }]);
    expect(await result).toHaveLength(101);
    const aborted = api.mine(controller.signal); const active = http.expectOne(r => r.url === '/api/broadcasts/mine');
    controller.abort(); await expect(aborted).rejects.toThrow(); expect(active.cancelled).toBe(true);
  });
});
