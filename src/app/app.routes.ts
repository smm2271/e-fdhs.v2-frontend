import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { teacherGuard } from './services/teacher.guard';

export const routes: Routes = [
  { path: 'broadcasts/new', canActivate: [teacherGuard], loadComponent: () => import('./pages/broadcast/broadcast-new').then(m => m.BroadcastNew) },
  {
    path: 'broadcasts',
    loadComponent: () => import('./pages/broadcast/broadcast').then((m) => m.BroadcastFeed),
  },
  {
    path: '',
    component: Login,
  },
];
