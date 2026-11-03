import { ApplicationConfig, provideAppInitializer, inject, provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeng/themes/aura';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';

const RegaliPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eef2f8',
      100: '#d5deec',
      200: '#aab9d4',
      300: '#7a90b8',
      400: '#4d6490',
      500: '#233256',
      600: '#1e2c4c',
      700: '#18243f',
      800: '#121b30',
      900: '#0c1220',
      950: '#080c16',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimations(),
    provideRouter(routes),
    providePrimeNG({
      theme: {
        preset: RegaliPreset,
        options: { darkModeSelector: false },
      },
    }),
    MessageService,
    provideAppInitializer(() => inject(AuthService).init()),
  ],
};
