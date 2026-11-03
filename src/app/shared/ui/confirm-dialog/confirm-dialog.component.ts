import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  readonly title = input('Confirmar');
  readonly message = input('');
  readonly confirmLabel = input('Confirmar');
  readonly confirmIcon = input<string | null>(null);
  readonly closed = output<boolean>();
  readonly icon = computed(() => {
    const custom = this.confirmIcon();
    if (custom) return custom;
    const label = this.confirmLabel().toLowerCase();
    if (label.includes('eliminar')) return 'pi pi-trash';
    if (label.includes('cancelar')) return 'pi pi-times';
    return 'pi pi-check';
  });
}
