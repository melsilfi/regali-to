import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { EXAMPLE_SLUG } from '../../core/demo/demo-store';
import { countGifts, formatDate, sortGifts } from '../../core/format';
import { Gift, GiftList, GiftSuggestionInput } from '../../core/models';
import { GiftsService } from '../../core/gifts/gifts.service';
import { GiftListsService } from '../../core/lists/gift-lists.service';
import { ReservationsService } from '../../core/reservations/reservations.service';
import { SuggestionsService } from '../../core/suggestions/suggestions.service';
import { afterOverlayGone } from '../../core/ui/after-close';
import { ToastService } from '../../core/ui/toast.service';
import { GuestOptionsComponent } from './guest-options/guest-options.component';
import { GiftCardComponent } from './gift-card/gift-card.component';
import { ReserveDialogComponent } from './reserve-dialog/reserve-dialog.component';
import { SuggestDialogComponent } from './suggest-dialog/suggest-dialog.component';

@Component({
  selector: 'app-public-list',
  imports: [GiftCardComponent, GuestOptionsComponent, ReserveDialogComponent, SuggestDialogComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './public-list.component.html',
})
export class PublicListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);
  private readonly lists = inject(GiftListsService);
  private readonly giftsApi = inject(GiftsService);
  private readonly reservations = inject(ReservationsService);
  private readonly suggestions = inject(SuggestionsService);
  private readonly toast = inject(ToastService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly giftsLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly missing = signal(false);
  readonly list = signal<GiftList | null>(null);
  readonly gifts = signal<Gift[]>([]);
  readonly filter = signal<'all' | 'stores' | 'transfers' | Gift['status']>('all');
  readonly selected = signal<Gift | null>(null);
  readonly suggesting = signal<Gift | null>(null);
  readonly submitting = signal(false);
  readonly suggestingSubmit = signal(false);
  readonly reserveError = signal<string | null>(null);
  readonly suggestError = signal<string | null>(null);
  private reserveStale = false;
  readonly exampleSlug = EXAMPLE_SLUG;
  readonly isOwner = computed(() => {
    const user = this.auth.user();
    const current = this.list();
    if (!user || !current) return false;
    if (current.userId === user.id) return true;
    return this.lists.catalog().some((item) => item.id === current.id);
  });
  readonly formatDate = formatDate;
  readonly counts = computed(() => countGifts(this.gifts()));
  readonly viewFilters = computed(() => {
    const current = this.list();
    const filters: { id: 'all' | 'stores' | 'transfers' | Gift['status']; label: string; icon?: string }[] = [
      { id: 'all', label: 'Todos' },
      { id: 'AVAILABLE', label: 'Disponibles', icon: 'pi pi-circle' },
      { id: 'RESERVED', label: 'Reservados', icon: 'pi pi-lock' },
      { id: 'RECEIVED', label: 'Recibidos', icon: 'pi pi-check' },
    ];
    if (current?.guestOptions.stores.length) filters.push({ id: 'stores', label: 'Locales', icon: 'pi pi-shop' });
    if (current?.guestOptions.transfers.length) filters.push({ id: 'transfers', label: 'Transferencia', icon: 'pi pi-wallet' });
    return filters;
  });
  readonly visibleGifts = computed(() => {
    const filter = this.filter();
    const gifts = sortGifts(this.gifts());
    if (filter === 'all' || filter === 'stores' || filter === 'transfers') return gifts;
    return gifts.filter((gift) => gift.status === filter);
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      void this.load(params.get('slug') ?? '');
    });
  }

  async load(slug: string): Promise<void> {
    this.loading.set(true);
    this.giftsLoading.set(false);
    this.error.set(null);
    this.missing.set(false);
    this.selected.set(null);
    this.gifts.set([]);
    try {
      const list = await this.lists.publicBySlug(slug);
      if (!list) {
        this.missing.set(true);
        this.list.set(null);
        return;
      }
      this.list.set(list);
      this.title.setTitle(`${list.title} · regali.to`);
      this.loading.set(false);
      this.giftsLoading.set(true);
      this.gifts.set(await this.giftsApi.forList(list.id));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos abrir la lista.');
    } finally {
      this.loading.set(false);
      this.giftsLoading.set(false);
    }
  }

  backToList(): void {
    const current = this.list();
    if (current) this.lists.select(current.id);
  }

  openReserve(gift: Gift): void {
    if (gift.status !== 'AVAILABLE') return;
    this.reserveError.set(null);
    this.reserveStale = false;
    this.selected.set(gift);
  }

  closeReserve(): void {
    this.selected.set(null);
    if (!this.reserveStale) return;
    this.reserveStale = false;
    const list = this.list();
    afterOverlayGone(this.destroyRef, async () => {
      if (list) this.gifts.set(await this.giftsApi.forList(list.id));
    });
  }

  openSuggest(gift: Gift): void {
    if (gift.status === 'RECEIVED') return;
    this.suggestError.set(null);
    this.suggesting.set(gift);
  }

  async sendSuggestion(input: GiftSuggestionInput): Promise<void> {
    const gift = this.suggesting();
    if (!gift) return;
    this.suggestingSubmit.set(true);
    this.suggestError.set(null);
    try {
      await this.suggestions.suggest(gift, input);
      this.suggesting.set(null);
      afterOverlayGone(this.destroyRef, () => {
        this.toast.show('Ya enviamos tu sugerencia, si la aceptan vas a ver el regalo en la lista. Actualizá en unos minutos.');
      });
    } catch (error) {
      this.suggestError.set(error instanceof Error ? error.message : 'No pudimos enviar la sugerencia.');
    } finally {
      this.suggestingSubmit.set(false);
    }
  }

  async confirm(input: Parameters<ReservationsService['reserve']>[1]): Promise<void> {
    const gift = this.selected();
    if (!gift) return;
    this.submitting.set(true);
    this.reserveError.set(null);
    try {
      const confirmation = await this.reservations.reserve(gift.id, input);
      const list = this.list();
      this.selected.set(null);
      afterOverlayGone(this.destroyRef, async () => {
        if (list) this.gifts.set(await this.giftsApi.forList(list.id));
        this.toast.celebrate(`Ya avisamos que reservaste ${confirmation.giftName}`);
      });
    } catch (error) {
      this.reserveError.set(error instanceof Error ? error.message : 'No pudimos reservar el regalo.');
      this.reserveStale = true;
    } finally {
      this.submitting.set(false);
    }
  }
}
