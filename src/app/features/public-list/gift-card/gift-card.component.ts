import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Button } from 'primeng/button';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge/status-badge.component';
import { displayGiftImage } from '../../../core/gift-image';
import { priorityLabel } from '../../../core/format';
import { LoadingImageComponent } from '../../../shared/ui/loading-image/loading-image.component';
import { Gift } from '../../../core/models';

@Component({
  selector: 'app-gift-card',
  imports: [Button, LoadingImageComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gift-card.component.html',
})
export class GiftCardComponent {
  readonly gift = input.required<Gift>();
  readonly interactive = input(true);
  readonly reserve = output<Gift>();
  readonly suggest = output<Gift>();
  readonly photo = computed(() => displayGiftImage(this.gift()));
  readonly priorityLabel = priorityLabel;

  openProduct(): void {
    const url = this.gift().externalUrl;
    if (url) window.open(url, '_blank', 'noopener');
  }
}
