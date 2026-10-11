import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const teacherGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthService).me().pipe(
    map(profile => profile.account_type === 'teacher' ? true : router.createUrlTree(['/broadcasts'])),
    catchError(() => of(router.createUrlTree(['/'], { queryParams: { returnUrl: state.url } }))),
  );
};
