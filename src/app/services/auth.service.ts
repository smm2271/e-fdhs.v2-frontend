import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, tap } from 'rxjs';

export type AccountType = 'student' | 'teacher';

export interface AccountProfile {
  id: string;
  account: string;
  account_type: AccountType;
  position_name: string;
  group_name: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface LoginRequest {
  account_type: AccountType;
  account: string;
  position_name?: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly identityRevision = signal(0);

  logout(): Observable<void> {
    return this.http
      .post<void>('/auth/logout', {}, { withCredentials: true })
      .pipe(tap(() => this.identityRevision.update((value) => value + 1)));
  }

  login(request: LoginRequest): Observable<AccountProfile> {
    return this.http.post<void>('/auth/login', request, { withCredentials: true }).pipe(
      switchMap(() => this.me()),
      tap(() => this.identityRevision.update((value) => value + 1)),
    );
  }

  me(): Observable<AccountProfile> {
    return this.http.get<AccountProfile>('/auth/me', { withCredentials: true });
  }
}
