import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

function readAuthCallbackError(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const description = url.searchParams.get('error_description') ?? hash.get('error_description');
  const code = url.searchParams.get('error') ?? hash.get('error');
  if (!description && !code) return null;
  return description?.replace(/\+/g, ' ') || 'No pudimos completar el ingreso con Google.';
}

@Component({
  selector: 'app-auth-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="grid min-h-[70dvh] place-items-center px-5 text-center">
      <div>
        <h1 class="font-serif text-4xl">{{ error() ? 'No pudimos ingresar' : 'Entrando a tu lista…' }}</h1>
        @if (error()) {
          <p class="mt-3 text-ink/70">{{ error() }}</p>
        }
      </div>
    </section>
  `,
})
export class AuthCallbackComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly error = signal<string | null>(null);

  constructor() {
    const urlError = readAuthCallbackError();
    void this.auth.whenReady().then(() => {
      if (this.auth.user()) {
        void this.router.navigateByUrl('/panel');
        return;
      }
      this.error.set(urlError ?? 'El enlace venció o fue cancelado. Probá ingresar de nuevo.');
    });
  }
}
