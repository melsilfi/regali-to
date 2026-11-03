import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';

@Component({
  selector: 'app-loading-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'loading-image',
    '[class.loading-image-fill]': 'fill()',
  },
  template: `
    @if (!ready()) {
      <span class="loading-image-state" aria-hidden="true">
        <i class="pi pi-spinner pi-spin"></i>
      </span>
    }
    <img
      [src]="src()"
      [alt]="alt()"
      (load)="mark($event)"
      (error)="mark($event)"
      [class.loading-image-pending]="!ready()"
    />
    @if (removable()) {
      <button type="button" class="loading-image-remove" aria-label="Eliminar imagen" (click)="remove($event)">
        <i class="pi pi-trash" aria-hidden="true"></i>
        Eliminar
      </button>
    }
  `,
})
export class LoadingImageComponent {
  readonly src = input.required<string>();
  readonly alt = input('');
  readonly fill = input(false);
  readonly removable = input(false);
  readonly removed = output<void>();
  readonly ready = linkedSignal(() => {
    this.src();
    return false;
  });

  mark(event: Event): void {
    const image = event.target as HTMLImageElement;
    const current = image.getAttribute('src');
    if (current !== this.src()) return;
    this.ready.set(true);
  }

  remove(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.removed.emit();
  }
}
