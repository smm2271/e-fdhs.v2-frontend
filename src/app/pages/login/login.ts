import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.scss',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected role = signal<'teacher' | 'student'>('student');
  protected account = '';
  protected positionName = '';
  protected password = '';
  protected isSubmitting = signal(false);
  protected errorMessage = signal('');
  protected welcomeName = signal<string | null>(null);

  protected setRole(role: 'teacher' | 'student'): void {
    this.role.set(role);
    this.positionName = '';
  }

  protected login(): void {
    if (this.isSubmitting()) return;

    this.errorMessage.set('');
    this.isSubmitting.set(true);
    this.auth.login({
      account_type: this.role(),
      account: this.account.trim(),
      ...(this.positionName ? { position_name: this.positionName } : {}),
      password: this.password,
    }).subscribe({
      next: (profile) => {
        this.role.set(profile.account_type);
        this.welcomeName.set(profile.display_name?.trim() || profile.account);
        this.isSubmitting.set(false);
        this.password = '';
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(
          returnUrl?.startsWith('/') && !returnUrl.startsWith('//')
            && this.router.parseUrl(returnUrl).root.children['primary']?.segments[0]?.path !== undefined
            ? returnUrl : '/broadcasts',
          { replaceUrl: true },
        );
      },
      error: (error: { status?: number }) => {
        this.errorMessage.set(error.status === 401 || error.status === 403
          ? '帳號、身分或密碼錯誤，請再試一次。'
          : '登入失敗，請確認後端服務是否可連線。');
        this.isSubmitting.set(false);
      },
    });
  }
}
