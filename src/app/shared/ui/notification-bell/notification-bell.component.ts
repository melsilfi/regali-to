import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Popover } from 'primeng/popover';
import { BellNotice, NotificationCenter } from '../../../core/ui/notification-center';

@Component({
  selector: 'app-notification-bell',
  imports: [Popover, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notification-bell.component.html',
})
export class NotificationBellComponent {
  readonly center = inject(NotificationCenter);
  readonly active = input(false);
  private readonly router = inject(Router);
  private readonly panel = viewChild.required<Popover>('panel');

  constructor() {
    this.center.start();
    inject(DestroyRef).onDestroy(() => this.center.stop());
  }

  open(event: Event): void {
    this.panel().toggle(event);
  }

  close(): void {
    this.panel().hide();
  }

  openFocus(item: BellNotice): void {
    if (!item.focus) return;
    this.center.openFocus(item);
    this.close();
    void this.router.navigate(['/panel']);
  }
}
