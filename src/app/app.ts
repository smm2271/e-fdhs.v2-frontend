import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { ThemeService } from './services/theme/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly theme = inject(ThemeService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loggingOut = signal(false);
  readonly logoutError = signal('');

  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.logoutError.set('');
    this.auth.logout().subscribe({
      next: () => {
        this.loggingOut.set(false);
        void this.router.navigateByUrl('/', { replaceUrl: true });
      },
      error: () => {
        this.loggingOut.set(false);
        this.logoutError.set('登出失敗，請稍後再試。');
      },
    });
  }
  ngOnInit(): void { void this.theme.initialize(); }
  protected readonly title = signal('frontend');
}
