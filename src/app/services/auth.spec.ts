import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { AccountProfile, AuthService } from './auth.service';
import { authGuard } from './auth.guard';
import { teacherGuard } from './teacher.guard';

describe('Session authentication', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  const profile = { account_type: 'student', account: 'student' } as AccountProfile;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    ] });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => http.verify());

  it('restores identity before admitting an authenticated visitor', async () => {
    const result = firstValueFrom(TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/broadcasts' } as never)) as Observable<boolean | UrlTree>);
    const request = http.expectOne('/auth/me');
    expect(request.request.withCredentials).toBe(true);
    request.flush(profile);
    expect(await result).toBe(true);
    expect(auth.profile()).toEqual(profile);
  });

  it('preserves the requested URL when the session has expired', async () => {
    auth.profile.set(profile);
    const result = firstValueFrom(TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/broadcasts?week=2026-W41' } as never)) as Observable<UrlTree>);
    http.expectOne('/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    const tree = await result;
    expect(tree.queryParams['returnUrl']).toBe('/broadcasts?week=2026-W41');
    expect(auth.profile()).toBeNull();
  });

  it('redirects a student away from teacher pages', async () => {
    const result = firstValueFrom(TestBed.runInInjectionContext(() =>
      teacherGuard({} as never, { url: '/broadcasts/new' } as never)) as Observable<UrlTree>);
    http.expectOne('/auth/me').flush(profile);
    expect(TestBed.inject(Router).serializeUrl(await result)).toBe('/broadcasts');
  });

  it.each([204, 401])('clears identity and private-data revision on logout (%s)', async status => {
    auth.profile.set(profile);
    const result = firstValueFrom(auth.logout());
    const request = http.expectOne('/auth/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null, { status, statusText: status === 204 ? 'No Content' : 'Unauthorized' });
    await result;
    expect(auth.profile()).toBeNull();
    expect(auth.identityRevision()).toBe(1);
  });

  it('retains identity when logout fails so it can be retried', async () => {
    auth.profile.set(profile);
    const result = firstValueFrom(auth.logout());
    const assertion = expect(result).rejects.toMatchObject({ status: 500 });
    http.expectOne('/auth/logout').flush(null, { status: 500, statusText: 'Server Error' });
    await assertion;
    expect(auth.profile()).toEqual(profile);
    expect(auth.identityRevision()).toBe(0);
  });
});
