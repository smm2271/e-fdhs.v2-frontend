import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthService).me().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/'], { queryParams: { returnUrl: state.url } }))),
  );
};
