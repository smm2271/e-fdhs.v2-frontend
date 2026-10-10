import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { teacherGuard } from './services/teacher.guard';

export const routes: Routes = [
  { path: 'settings/themes', loadComponent: () => import('./pages/themes/themes').then(m => m.Themes) },
  { path: 'broadcasts/new', canActivate: [teacherGuard], loadComponent: () => import('./pages/broadcast/broadcast-new').then(m => m.BroadcastNew) },
  { path: 'broadcasts/mine', canActivate: [teacherGuard], loadComponent: () => import('./pages/broadcast/broadcast-mine').then(m => m.BroadcastMine) },
  {
    path: 'broadcasts',
    loadComponent: () => import('./pages/broadcast/broadcast').then((m) => m.BroadcastFeed),
  },
  {
    path: '',
    component: Login,
  },
];
