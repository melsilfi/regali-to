import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'mlr-token';

@Injectable({ providedIn: 'root' })
export class ApiService {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const token = this.token();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${environment.apiUrl}${path}`, { ...init, headers });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as { message?: string }) : null;
    if (!response.ok) throw new Error(data?.message || 'No pudimos completar la acción.');
    return data as T;
  }

  token(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  saveToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  }
}
