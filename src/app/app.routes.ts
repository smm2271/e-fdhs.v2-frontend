import { Routes } from '@angular/router';
import { Login } from './pages/login/login';

export const routes: Routes = [
  {
    path: 'broadcasts',
    loadComponent: () => import('./pages/broadcast/broadcast').then((m) => m.BroadcastFeed),
  },
  {
    path: '',
    component: Login,
  },
];
