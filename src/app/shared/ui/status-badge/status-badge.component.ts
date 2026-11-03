import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { statusLabel } from '../../../core/format';
import { GiftStatus } from '../../../core/models';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="gift-status" [attr.data-status]="status()">
      <i [class]="icon()" aria-hidden="true"></i>
      {{ statusLabel(status()) }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<GiftStatus>();
  readonly statusLabel = statusLabel;
  readonly icon = computed(() => {
    const status = this.status();
    if (status === 'AVAILABLE') return 'pi pi-circle';
    if (status === 'RESERVED') return 'pi pi-lock';
    return 'pi pi-check';
  });
}
