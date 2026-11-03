import { Injectable, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messages = inject(MessageService);
  readonly burst = signal(false);
  private next: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string): void {
    this.messages.add({ severity: 'success', summary: message, life: 2800 });
  }

  warn(message: string): void {
    this.messages.add({ severity: 'warn', summary: message, life: 4200 });
  }

  celebrate(message: string): void {
    const reduce =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      this.show(message);
      return;
    }
    this.next = message;
    this.burst.set(false);
    if (this.timer) clearTimeout(this.timer);
    setTimeout(() => this.burst.set(true));
    this.timer = setTimeout(() => this.finishBurst({ animationName: 'gift-burst' } as AnimationEvent), 1700);
  }

  finishBurst(event: AnimationEvent): void {
    if (event.animationName !== 'gift-burst' || !this.burst()) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.burst.set(false);
    const message = this.next;
    this.next = null;
    if (message) this.show(message);
  }
}
