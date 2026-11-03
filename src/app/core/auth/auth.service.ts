import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { userError } from '../errors';
import { SessionUser } from '../models';
import { DemoStore } from '../demo/demo-store';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<SessionUser | null>(null);
  readonly ready = signal(false);
  readonly isDemo: boolean;

  private readonly readyPromise: Promise<void>;
  private readonly resolveReady: () => void;

  constructor(
    private readonly api: ApiService,
    private readonly demo: DemoStore,
  ) {
    this.isDemo = !environment.useApi;
    let resolveReady!: () => void;
    this.readyPromise = new Promise((resolve) => {
      resolveReady = resolve;
    });
    this.resolveReady = resolveReady;
  }

  init(): Promise<void> {
    if (this.isDemo) {
      this.user.set(this.demo.currentUser());
      this.finish();
      return Promise.resolve();
    }
    if (!this.api.token()) {
      this.finish();
      return Promise.resolve();
    }
    return this.api
      .request<SessionUser>('/api/auth/me')
      .then((user) => this.user.set(user))
      .catch(() => this.api.clearToken())
      .then(() => this.finish());
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async signInWithGoogle(): Promise<void> {
    if (this.isDemo) {
      this.user.set(this.demo.signInDemoOwner());
      return;
    }
    throw new Error('En esta versión el ingreso es con email y contraseña.');
  }

  async signUp(name: string, email: string, password: string): Promise<'session' | 'confirm-email'> {
    if (this.isDemo) {
      try {
        this.user.set(this.demo.signUp(name, email, password));
      } catch (error) {
        throw userError(error);
      }
      return 'session';
    }
    const result = await this.api.request<{ token: string; user: SessionUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    this.api.saveToken(result.token);
    this.user.set(result.user);
    return 'session';
  }

  async signIn(email: string, password: string): Promise<void> {
    if (this.isDemo) {
      try {
        this.user.set(this.demo.signIn(email, password));
      } catch (error) {
        throw userError(error);
      }
      return;
    }
    const result = await this.api.request<{ token: string; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.api.saveToken(result.token);
    this.user.set(result.user);
  }

  async sendPasswordReset(email: string): Promise<void> {
    if (this.isDemo) return;
    await this.api.request('/api/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async updatePassword(password: string): Promise<void> {
    if (this.isDemo) return;
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    await this.api.request('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  }

  async signOut(): Promise<void> {
    if (this.isDemo) {
      this.demo.signOut();
      this.user.set(null);
      return;
    }
    this.api.clearToken();
    this.user.set(null);
  }

  private finish(): void {
    this.ready.set(true);
    this.resolveReady();
  }
}
