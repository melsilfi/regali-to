import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDateTime } from '../../../core/format';
import { Reservation } from '../../../core/models';
import { GiftListsService } from '../../../core/lists/gift-lists.service';
import { ReservationsService } from '../../../core/reservations/reservations.service';
import { afterOverlayGone } from '../../../core/ui/after-close';
import { ConfirmDialogComponent } from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge/status-badge.component';

@Component({
  selector: 'app-reservations',
  imports: [RouterLink, ConfirmDialogComponent, EmptyStateComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservations.component.html',
})
export class ReservationsComponent implements OnInit {
  private readonly reservationsApi = inject(ReservationsService);
  private readonly listsApi = inject(GiftListsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly originListId = this.listsApi.selectedId();

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly rows = signal<Reservation[]>([]);
  readonly pendingCancel = signal<Reservation | null>(null);
  readonly formatDateTime = formatDateTime;

  async ngOnInit(): Promise<void> {
    try {
      this.rows.set(await this.reservationsApi.forOwner());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos cargar las reservas.');
    } finally {
      this.loading.set(false);
    }
  }

  backToList(): void {
    if (this.originListId) this.listsApi.select(this.originListId);
  }

  askCancel(row: Reservation): void {
    this.pendingCancel.set(row);
  }

  async confirmCancel(accepted: boolean): Promise<void> {
    const row = this.pendingCancel();
    this.pendingCancel.set(null);
    if (!accepted || !row) return;
    try {
      await this.reservationsApi.cancel(row.id);
      const rows = await this.reservationsApi.forOwner();
      afterOverlayGone(this.destroyRef, () => this.rows.set(rows));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos cancelar la reserva.');
    }
  }
}
