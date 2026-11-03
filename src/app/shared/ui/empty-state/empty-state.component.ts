import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="empty-state card">
      <span class="empty-state-icon" aria-hidden="true"><i [class]="icon()"></i></span>
      <h2 class="empty-state-title font-serif">{{ title() }}</h2>
      <p class="empty-state-text">{{ text() }}</p>
      <ng-content />
    </section>
  `,
})
export class EmptyStateComponent {
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly text = input.required<string>();
}
