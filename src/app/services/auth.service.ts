import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';

export type AccountType = 'student' | 'teacher';

export interface AccountProfile {
  id: string;
  account: string;
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

  login(request: LoginRequest): Observable<AccountProfile> {
    return this.http
      .post<void>('/auth/login', request, { withCredentials: true })
      .pipe(switchMap(() => this.me()));
  }

  me(): Observable<AccountProfile> {
    return this.http.get<AccountProfile>('/auth/me', { withCredentials: true });
  }
}
