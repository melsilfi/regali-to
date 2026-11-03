import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'ingresar',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'recuperar',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/auth-callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: 'panel',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'regalos/nuevo',
        loadComponent: () =>
          import('./features/dashboard/gift-editor/gift-editor.component').then((m) => m.GiftEditorComponent),
      },
      {
        path: 'regalos/:giftId',
        loadComponent: () =>
          import('./features/dashboard/gift-editor/gift-editor.component').then((m) => m.GiftEditorComponent),
      },
      {
        path: 'reservas',
        loadComponent: () =>
          import('./features/dashboard/reservations/reservations.component').then((m) => m.ReservationsComponent),
      },
    ],
  },
  {
    path: ':slug',
    loadComponent: () => import('./features/public-list/public-list.component').then((m) => m.PublicListComponent),
  },
];
