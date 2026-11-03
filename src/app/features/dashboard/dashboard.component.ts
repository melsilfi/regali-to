import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, HostListener, inject, OnInit, signal, untracked } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { interval } from 'rxjs';
import { PrimeTemplate } from 'primeng/api';
import { SelectChangeEvent, Select } from 'primeng/select';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { StatusBadgeComponent } from '../../shared/ui/status-badge/status-badge.component';
import { AuthService } from '../../core/auth/auth.service';
import { formatDateTime, priorityLabel, sortGifts } from '../../core/format';
import { displayGiftImage } from '../../core/gift-image';
import { imageFileFromClipboard } from '../../core/image-clipboard';
import { GuestActivityService } from '../../core/guest-activity/guest-activity.service';
import { emptyGuestOptions, Gift, GiftList, GiftStatus, GiftStore, GiftSuggestion, GiftTransfer, Reservation, storeMapEmbedUrl, storeMapHref, storeSocialHref } from '../../core/models';
import { SuggestionsService } from '../../core/suggestions/suggestions.service';
import { GiftsService } from '../../core/gifts/gifts.service';
import { GiftListsService, MAX_GIFT_LISTS } from '../../core/lists/gift-lists.service';
import { ReservationsService } from '../../core/reservations/reservations.service';
import { slugify, validateSlug } from '../../core/slug';
import { DashboardTab, DashboardTabs, NotificationCenter } from '../../core/ui/notification-center';
import { AfterClose, afterOverlayGone } from '../../core/ui/after-close';
import { ToastService } from '../../core/ui/toast.service';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { LoadingImageComponent } from '../../shared/ui/loading-image/loading-image.component';
import { GiftEditorComponent } from './gift-editor/gift-editor.component';

type HistoryKind = 'gift' | 'store' | 'transfer';

interface HistoryRow {
  id: string;
  listId: string;
  listTitle: string;
  kind: HistoryKind;
  createdAt: string;
  name: string;
  fromStatus: GiftStatus | null;
  toStatus: GiftStatus | null;
  detail: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    ConfirmDialogComponent,
    EmptyStateComponent,
    LoadingImageComponent,
    GiftEditorComponent,
    Button,
    Dialog,
    Select,
    PrimeTemplate,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly listsApi = inject(GiftListsService);
  private readonly giftsApi = inject(GiftsService);
  private readonly reservationsApi = inject(ReservationsService);
  private readonly guestActivity = inject(GuestActivityService);
  private readonly suggestionsApi = inject(SuggestionsService);
  private readonly notifications = inject(NotificationCenter);
  private readonly dashboardTabs = inject(DashboardTabs);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.auth.user;
  readonly isDemo = this.auth.isDemo;
  readonly loading = signal(true);
  readonly giftsLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly lists = signal<GiftList[]>([]);
  readonly gifts = signal<Gift[]>([]);
  readonly reservations = signal<Reservation[]>([]);
  readonly suggestions = signal<GiftSuggestion[]>([]);
  readonly reservationGift = signal<Gift | null>(null);
  readonly suggestionGiftId = signal<string | null>(null);
  readonly reserveDraft = signal<Gift | null>(null);
  readonly reserveError = signal<string | null>(null);
  readonly reserveSaving = signal(false);
  readonly statusReset = signal(0);
  readonly historyItems = signal<HistoryRow[]>([]);
  readonly historyReady = signal(false);
  readonly giftDialog = signal<{ id: string | null } | null>(null);
  readonly giftDialogVisible = signal(false);
  readonly suggestionVisible = signal(false);
  readonly reserveVisible = signal(false);
  private readonly listClosed = new AfterClose();
  private readonly storeClosed = new AfterClose();
  private readonly transferClosed = new AfterClose();
  private readonly giftClosed = new AfterClose();
  private readonly suggestionClosed = new AfterClose();
  private readonly reserveClosed = new AfterClose();
  readonly giftFilter = signal<GiftStatus | 'ALL'>('ALL');
  readonly historyGift = signal('');
  readonly historyList = signal('');
  readonly historyStatus = signal<'' | GiftStatus>('');
  readonly editingList = signal(false);
  readonly creatingList = signal(false);
  readonly savingList = signal(false);
  readonly uploadingCover = signal(false);
  readonly pendingDelete = signal<Gift | null>(null);
  readonly pendingRemoval = signal<
    | { kind: 'store'; index: number; name: string }
    | { kind: 'transfer'; index: number; name: string }
    | { kind: 'cover' }
    | { kind: 'list'; id: string; name: string }
    | null
  >(null);
  readonly slugTouched = signal(false);
  readonly shareOpen = signal(false);
  readonly listMenuOpen = signal(false);
  readonly guestStores = signal<GiftStore[]>([]);
  readonly guestTransfers = signal<GiftTransfer[]>([]);
  readonly storeDialog = signal(false);
  readonly editingStore = signal<number | null>(null);
  readonly transferDialog = signal(false);
  readonly editingTransfer = signal<number | null>(null);
  readonly transferError = signal<string | null>(null);
  readonly storeForm = this.formBuilder.nonNullable.group({
    name: ['', requiredText],
    address: ['', requiredText],
    underName: [''],
    note: ['', Validators.maxLength(80)],
    socialUrl: ['', optionalWebUrl],
    mapUrl: ['', requiredWebUrl],
  });
  readonly storeSocialHref = storeSocialHref;
  readonly storeMapHref = storeMapHref;
  readonly transferForm = this.formBuilder.nonNullable.group({
    holder: [''],
    bank: [''],
    alias: [''],
    cbu: [''],
  });
  readonly reserveForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', Validators.required],
    email: [''],
    message: [''],
  });
  readonly activeTab = this.dashboardTabs.active;
  readonly listDialogOpen = computed(() => this.creatingList() || this.editingList());
  readonly origin = typeof window === 'undefined' ? '' : window.location.origin;
  readonly displayGiftImage = displayGiftImage;
  readonly formatDateTime = formatDateTime;
  readonly priorityLabel = priorityLabel;
  readonly statusOptions = [
    { label: 'Disponible', value: 'AVAILABLE' as GiftStatus },
    { label: 'Reservado', value: 'RESERVED' as GiftStatus },
    { label: 'Recibido', value: 'RECEIVED' as GiftStatus },
  ];

  readonly selected = computed(() => {
    const lists = this.lists();
    const selectedId = this.listsApi.selectedId();
    return lists.find((list) => list.id === selectedId) ?? lists[0] ?? null;
  });

  readonly giftViews = [
    { label: 'Todos', value: 'ALL' as const },
    { label: 'Disponible', value: 'AVAILABLE' as const },
    { label: 'Reservado', value: 'RESERVED' as const },
    { label: 'Recibido', value: 'RECEIVED' as const },
  ];
  readonly visibleGifts = computed(() => {
    const filter = this.giftFilter();
    const gifts = sortGifts(this.gifts());
    if (filter === 'ALL') return gifts;
    return gifts.filter((gift) => gift.status === filter);
  });
  readonly historyStatuses = [
    { label: 'Todos los estados', value: '' as const },
    { label: 'Disponible', value: 'AVAILABLE' as const },
    { label: 'Reservado', value: 'RESERVED' as const },
    { label: 'Recibido', value: 'RECEIVED' as const },
  ];
  readonly historyKind = signal<'' | HistoryKind>('');
  readonly historyKinds = [
    { label: 'Todos los tipos', value: '' as const },
    { label: 'Regalo', value: 'gift' as const },
    { label: 'Local', value: 'store' as const },
    { label: 'Transferencia', value: 'transfer' as const },
  ];
  readonly panelTabs: { id: DashboardTab; label: string; icon: string }[] = [
    { id: 'general', label: 'Regalos', icon: 'pi pi-gift' },
    { id: 'locales', label: 'Locales', icon: 'pi pi-shop' },
    { id: 'transferencias', label: 'Transferencias', icon: 'pi pi-wallet' },
  ];
  readonly historyListOptions = computed(() => [
    { label: 'Todas las listas', value: '' },
    ...this.lists().map((list) => ({ label: list.title, value: list.id })),
  ]);
  readonly historyRows = computed(() => this.historyItems());
  readonly visibleEvents = computed(() => {
    const gift = this.historyGift().trim().toLocaleLowerCase('es');
    const listId = this.historyList();
    const status = this.historyStatus();
    const kind = this.historyKind();
    return this.historyRows().filter((event) => {
      const matchesGift = !gift || event.name.toLocaleLowerCase('es').includes(gift) || event.detail.toLocaleLowerCase('es').includes(gift);
      const matchesList = !listId || event.listId === listId;
      const matchesStatus = !status || event.fromStatus === status || event.toStatus === status;
      const matchesKind = !kind || event.kind === kind;
      return matchesGift && matchesList && matchesStatus && matchesKind;
    });
  });

  readonly listForm = this.formBuilder.nonNullable.group({
    ownerName: ['', requiredText],
    title: ['', requiredText],
    slug: ['', requiredText],
    description: [''],
    eventDate: ['', Validators.required],
    coverImage: [''],
  });

  private seenListId: string | null = null;

  constructor() {
    effect(() => {
      const target = this.notifications.focus();
      const ready = !this.loading();
      if (!target || !ready) return;
      untracked(() => void this.revealSuggestion(target));
    });
    effect(() => {
      const id = this.listsApi.selectedId();
      if (this.loading() || !id || id === this.seenListId) return;
      const list = this.lists().find((item) => item.id === id);
      if (!list) return;
      untracked(() => {
        this.giftFilter.set('ALL');
        this.historyGift.set('');
        this.historyList.set('');
        this.historyStatus.set('');
        this.historyKind.set('');
        this.dashboardTabs.showGeneral();
        void this.loadList(list);
      });
    });
    effect(() => {
      if (this.dashboardTabs.active() !== 'historial' || this.loading()) return;
      const lists = this.lists();
      untracked(() => void this.loadHistory(lists));
    });
    effect(() => {
      if (!this.listsApi.pendingCreate() || this.loading()) return;
      untracked(() => {
        this.listsApi.pendingCreate.set(false);
        this.startNewList();
      });
    });
  }

  async ngOnInit(): Promise<void> {
    const user = this.user();
    if (user && !this.listForm.controls.ownerName.value) {
      this.listForm.patchValue({
        ownerName: user.name,
        title: `Lista de regalos de ${user.name}`,
        slug: slugify(user.name + 'lista'),
      });
    }
    await this.reload();
    interval(20000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const list = this.selected();
        if (list && !this.editingList() && !this.creatingList()) void this.loadList(list);
      });
  }

  async reload(quiet = false): Promise<void> {
    if (!quiet) this.loading.set(true);
    this.error.set(null);
    try {
      const lists = await this.listsApi.mine();
      this.lists.set(lists);
      if (this.creatingList() || this.editingList()) return;
      const storedId = this.listsApi.selectedId();
      if ((!storedId || !lists.some((list) => list.id === storedId)) && lists[0]) this.listsApi.select(lists[0].id);
      const current = this.selected();
      if (!current) {
        this.gifts.set([]);
        this.historyItems.set([]);
        this.historyReady.set(true);
        return;
      }
      await this.loadList(current);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos cargar tu panel.');
    } finally {
      if (!quiet) this.loading.set(false);
    }
  }

  async loadList(list: GiftList): Promise<void> {
    const switching = this.seenListId !== list.id;
    this.seenListId = list.id;
    if (switching) this.giftsLoading.set(true);
    try {
    const [gifts, reservations] = await Promise.all([
      this.giftsApi.forList(list.id),
      this.reservationsApi.forOwner(),
    ]);
    this.gifts.set(gifts);
    this.reservations.set(reservations.filter((item) => item.listId === list.id));
    try {
      this.suggestions.set(await this.suggestionsApi.forList(list.id));
    } catch {
      this.suggestions.set([]);
    }
    if (this.dashboardTabs.active() === 'historial') void this.loadHistory(this.lists());
    if (!this.creatingList() && !this.editingList()) {
      this.listForm.patchValue({
        ownerName: list.ownerName,
        title: list.title,
        slug: list.slug,
        description: list.description ?? '',
        eventDate: list.eventDate ?? '',
        coverImage: list.coverImage ?? '',
      });
      if (!this.storeDialog() && !this.transferDialog()) {
        this.setGuestOptions(this.lists().find((item) => item.id === list.id) ?? list);
      }
      this.slugTouched.set(true);
    }
    void this.notifications.refresh();
    } finally {
      if (switching) this.giftsLoading.set(false);
    }
  }

  toggleListMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.listMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  closeListMenu(event: MouseEvent): void {
    if (!this.listMenuOpen()) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.list-hero-menu-wrap')) return;
    this.listMenuOpen.set(false);
  }

  editFromMenu(): void {
    this.listMenuOpen.set(false);
    queueMicrotask(() => this.openEdit());
  }

  deleteFromMenu(list: GiftList): void {
    this.listMenuOpen.set(false);
    queueMicrotask(() => this.askDeleteList(list));
  }

  openPublic(): void {
    window.open(this.shareUrl(), '_blank', 'noopener');
  }

  openProduct(url: string): void {
    window.open(url, '_blank', 'noopener');
  }

  goNewGift(): void {
    const list = this.selected();
    if (!list) return;
    this.listsApi.select(list.id);
    this.giftDialog.set({ id: null });
    this.giftDialogVisible.set(true);
  }

  goGift(giftId: string): void {
    this.giftDialog.set({ id: giftId });
    this.giftDialogVisible.set(true);
  }

  onGiftVisible(open: boolean): void {
    this.giftDialogVisible.set(open);
  }

  onGiftDialogHide(): void {
    void this.giftClosed.flush();
    this.giftDialogVisible.set(false);
    queueMicrotask(() => this.giftDialog.set(null));
  }

  onGiftSaved(): void {
    const list = this.selected();
    this.giftClosed.queue(async () => {
      if (list) await this.loadList(list);
      if (!this.giftDialogVisible()) this.toast.show('Regalo guardado');
    });
    this.giftDialogVisible.set(false);
  }

  statusIcon(status: GiftStatus): string {
    if (status === 'AVAILABLE') return 'pi pi-circle';
    if (status === 'RESERVED') return 'pi pi-lock';
    return 'pi pi-check';
  }

  statusSeverity(status: GiftStatus): 'success' | 'warn' | 'info' {
    if (status === 'AVAILABLE') return 'success';
    if (status === 'RESERVED') return 'warn';
    return 'info';
  }

  pendingFor(giftId: string): GiftSuggestion[] {
    return this.suggestions().filter((item) => item.giftId === giftId && item.status === 'PENDING');
  }

  openSuggestion(gift: Gift): void {
    if (!this.pendingFor(gift.id).length) return;
    this.suggestionGiftId.set(gift.id);
    this.suggestionVisible.set(true);
  }

  onSuggestionVisible(open: boolean): void {
    this.suggestionVisible.set(open);
  }

  onSuggestionHide(): void {
    void this.suggestionClosed.flush();
    this.suggestionVisible.set(false);
    queueMicrotask(() => this.suggestionGiftId.set(null));
  }

  suggestionGift(): Gift | null {
    const giftId = this.suggestionGiftId();
    return this.gifts().find((gift) => gift.id === giftId) ?? null;
  }

  private async revealSuggestion(target: { listId: string; giftId: string }): Promise<void> {
    this.notifications.focus.set(null);
    this.dashboardTabs.showGeneral();
    this.giftFilter.set('ALL');
    const list = this.lists().find((item) => item.id === target.listId);
    if (list && this.selected()?.id !== target.listId) {
      this.listsApi.select(target.listId);
      await this.loadList(list);
    }
    this.suggestionGiftId.set(target.giftId);
    setTimeout(() => {
      document.getElementById(`gift-${target.giftId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  async decideSuggestion(suggestion: GiftSuggestion, accept: boolean): Promise<void> {
    const current = this.selected();
    if (!current) return;
    try {
      await this.suggestionsApi.decide(suggestion.id, accept);
      const message = accept ? 'Sugerencia aceptada' : 'Sugerencia rechazada';
      this.suggestionClosed.queue(async () => {
        await this.loadList(current);
        void this.notifications.refresh();
        if (!this.suggestionVisible()) this.toast.show(message);
      });
      this.suggestionVisible.set(false);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos resolver la sugerencia.');
    }
  }

  activeReservation(giftId: string): Reservation | undefined {
    return this.reservations().find((item) => item.giftId === giftId && item.status === 'ACTIVE');
  }

  openReservation(gift: Gift): void {
    this.reservationGift.set(gift);
  }

  onTitleInput(): void {
    if (this.slugTouched()) return;
    this.listForm.controls.slug.setValue(slugify(this.listForm.controls.title.value));
  }

  private async saveGuestOptions(stores = this.guestStores(), transfers = this.guestTransfers()): Promise<boolean> {
    const current = this.selected();
    if (!current) return false;
    this.savingList.set(true);
    this.error.set(null);
    const guestOptions = {
      stores: stores.filter((store) => store.name.trim()),
      transfers: transfers.filter((account) => `${account.alias ?? ''}`.trim() || `${account.cbu ?? ''}`.trim()),
    };
    try {
      const updated = await this.listsApi.update(current.id, {
        ownerName: current.ownerName,
        title: current.title,
        slug: current.slug,
        description: current.description ?? '',
        eventDate: current.eventDate ?? '',
        coverImage: current.coverImage,
        guestOptions,
      });
      this.lists.update((lists) => lists.map((list) => (list.id === updated.id ? { ...updated, guestOptions } : list)));
      return true;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos guardar.');
      return false;
    } finally {
      this.savingList.set(false);
    }
  }

  async saveList(): Promise<void> {
    const slugError = validateSlug(this.listForm.controls.slug.value);
    if (this.listForm.invalid || slugError) {
      this.listForm.markAllAsTouched();
      this.error.set(slugError);
      return;
    }
    const value = this.listForm.getRawValue();
    this.savingList.set(true);
    this.error.set(null);
    try {
      const input = {
        ...value,
        coverImage: value.coverImage.trim() || null,
        guestOptions: {
          stores: this.guestStores().filter((store) => store.name.trim()),
          transfers: this.guestTransfers().filter((account) => `${account.alias ?? ''}`.trim() || `${account.cbu ?? ''}`.trim()),
        },
      };
      const current = this.selected();
      if (this.creatingList() || !current) {
        await this.listsApi.create(input);
      } else {
        await this.listsApi.update(current.id, input);
      }
      this.listClosed.queue(async () => {
        await this.reload(true);
        if (!this.error() && !this.listDialogOpen()) this.toast.show('Lista guardada');
      });
      this.editingList.set(false);
      this.creatingList.set(false);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos guardar la lista.');
    } finally {
      this.savingList.set(false);
    }
  }

  async onCoverSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.uploadCover(file);
  }

  @HostListener('document:paste', ['$event'])
  async onCoverPaste(event: ClipboardEvent): Promise<void> {
    if (!this.listDialogOpen() || this.giftDialog() || this.uploadingCover()) return;
    const file = imageFileFromClipboard(event);
    if (!file) return;
    event.preventDefault();
    await this.uploadCover(file);
  }

  private async uploadCover(file: File): Promise<void> {
    this.uploadingCover.set(true);
    try {
      const url = await this.giftsApi.uploadImage(file);
      this.listForm.controls.coverImage.setValue(url);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos subir la foto.');
    } finally {
      this.uploadingCover.set(false);
    }
  }

  clearCover(): void {
    this.listForm.controls.coverImage.setValue('');
  }

  askRemoveStore(index: number): void {
    const store = this.guestStores()[index];
    if (!store) return;
    this.pendingRemoval.set({ kind: 'store', index, name: store.name });
  }

  askRemoveTransfer(index: number): void {
    const account = this.guestTransfers()[index];
    if (!account) return;
    this.pendingRemoval.set({ kind: 'transfer', index, name: account.holder || account.alias || 'esta cuenta' });
  }

  removalTitle(): string {
    const pending = this.pendingRemoval();
    if (!pending || pending.kind === 'cover') return 'Eliminar foto';
    if (pending.kind === 'list') return 'Eliminar lista';
    return pending.kind === 'store' ? 'Eliminar local' : 'Eliminar cuenta';
  }

  removalMessage(): string {
    const pending = this.pendingRemoval();
    if (!pending || pending.kind === 'cover') return '¿Eliminar la foto de portada?';
    if (pending.kind === 'list') return `¿Eliminar ${pending.name}? Se borran también sus regalos. Esta acción no se puede deshacer.`;
    return `¿Eliminar ${pending.name}?`;
  }

  async confirmRemoval(accepted: boolean): Promise<void> {
    const pending = this.pendingRemoval();
    this.pendingRemoval.set(null);
    if (!accepted || !pending) return;
    if (pending.kind === 'cover') {
      this.listForm.controls.coverImage.setValue('');
      return;
    }
    if (pending.kind === 'list') {
      await this.removeList(pending.id);
      return;
    }
    if (pending.kind === 'store') await this.removeStore(pending.index);
    else await this.removeTransfer(pending.index);
  }

  askDeleteList(list: GiftList): void {
    this.pendingRemoval.set({ kind: 'list', id: list.id, name: list.title });
  }

  async removeList(listId: string): Promise<void> {
    try {
      await this.listsApi.remove(listId);
      const next = this.lists().find((list) => list.id !== listId);
      if (next) this.listsApi.select(next.id);
      else this.listsApi.clearSelection();
      this.creatingList.set(false);
      this.editingList.set(false);
      afterOverlayGone(this.destroyRef, async () => {
        await this.reload(true);
        if (!this.error()) this.toast.show('Lista eliminada');
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos eliminar la lista.');
    }
  }

  setHistoryList(event: SelectChangeEvent): void {
    this.historyList.set(typeof event.value === 'string' ? event.value : '');
  }

  private historyToken = 0;

  private async loadHistory(lists: GiftList[]): Promise<void> {
    const token = ++this.historyToken;
    if (lists.length === 0) {
      this.historyItems.set([]);
      this.historyReady.set(true);
      return;
    }
    try {
      const groups = await Promise.all(lists.map((list) => this.historyFor(list)));
      if (token !== this.historyToken) return;
      this.historyItems.set(groups.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    } catch {
      if (token !== this.historyToken) return;
      this.historyItems.set([]);
    } finally {
      if (token === this.historyToken) this.historyReady.set(true);
    }
  }

  private async historyFor(list: GiftList): Promise<HistoryRow[]> {
    const gifts = await this.giftsApi.forList(list.id);
    const [events, visits, transfers] = await Promise.all([
      this.giftsApi.history(list.id, gifts.map((gift) => gift.id)),
      this.guestActivity.visits(list.id),
      this.guestActivity.transfers(list.id),
    ]);
    return [
      ...events.map((event) => ({
        id: event.id,
        listId: list.id,
        listTitle: list.title,
        kind: 'gift' as const,
        createdAt: event.createdAt,
        name: event.giftName,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        detail: event.detail || event.eventType,
      })),
      ...visits.map((visit) => ({
        id: visit.id,
        listId: list.id,
        listTitle: list.title,
        kind: 'store' as const,
        createdAt: visit.createdAt,
        name: visit.storeName,
        fromStatus: null,
        toStatus: null,
        detail: [visit.buyer, visit.amount, visit.note, visit.dedication].filter(Boolean).join(' · '),
      })),
      ...transfers.map((notice) => ({
        id: notice.id,
        listId: list.id,
        listTitle: list.title,
        kind: 'transfer' as const,
        createdAt: notice.createdAt,
        name: notice.destination,
        fromStatus: null,
        toStatus: null,
        detail: [notice.buyer, notice.dedication].filter(Boolean).join(' · '),
      })),
    ];
  }

  setHistoryStatus(event: SelectChangeEvent): void {
    const value = event.value;
    this.historyStatus.set(value === 'AVAILABLE' || value === 'RESERVED' || value === 'RECEIVED' ? value : '');
  }

  setHistoryKind(event: SelectChangeEvent): void {
    const value = event.value;
    this.historyKind.set(value === 'gift' || value === 'store' || value === 'transfer' ? value : '');
  }

  historyKindLabel(kind: HistoryKind): string {
    if (kind === 'store') return 'Local';
    if (kind === 'transfer') return 'Transferencia';
    return 'Regalo';
  }

  historyKindIcon(kind: HistoryKind): string {
    if (kind === 'store') return 'pi pi-shop';
    if (kind === 'transfer') return 'pi pi-wallet';
    return 'pi pi-gift';
  }

  setGiftFilter(event: SelectChangeEvent): void {
    const value = event.value;
    this.giftFilter.set(value === 'AVAILABLE' || value === 'RESERVED' || value === 'RECEIVED' ? value : 'ALL');
  }

  onTab(value: string | number | undefined): void {
    this.dashboardTabs.select(value);
  }

  pickList(listId: string): void {
    this.dashboardTabs.showGeneral();
    if (!listId || listId === this.selected()?.id) return;
    this.giftFilter.set('ALL');
    this.historyGift.set('');
    this.historyList.set('');
    this.historyStatus.set('');
    this.historyKind.set('');
    this.listsApi.select(listId);
    const list = this.lists().find((item) => item.id === listId);
    if (list) void this.loadList(list);
  }

  openEdit(): void {
    const list = this.selected();
    if (!list) return;
    this.creatingList.set(false);
    this.slugTouched.set(true);
    this.listForm.patchValue({
      ownerName: list.ownerName,
      title: list.title,
      slug: list.slug,
      description: list.description ?? '',
      eventDate: list.eventDate ?? '',
      coverImage: list.coverImage ?? '',
    });
    this.setGuestOptions(list);
    this.editingList.set(true);
  }

  onListDialog(open: boolean): void {
    if (!open) this.cancelForm();
  }

  onListDialogHide(): void {
    void this.listClosed.flush();
  }

  cancelForm(): void {
    const current = this.selected();
    this.creatingList.set(false);
    this.editingList.set(false);
    this.listClosed.queue(async () => {
      if (this.creatingList() || this.editingList() || !current) return;
      await this.loadList(current);
    });
  }

  startNewList(): void {
    if (this.lists().length >= MAX_GIFT_LISTS) {
      this.toast.warn('Podés tener hasta 5 listas. Para crear otra, borrá una de las que ya tenés.');
      return;
    }
    this.creatingList.set(true);
    this.editingList.set(true);
    this.slugTouched.set(false);
    const name = this.user()?.name ?? '';
    this.listForm.reset({
      ownerName: name,
      title: '',
      slug: '',
      description: '',
      eventDate: '',
      coverImage: '',
    });
    this.guestStores.set([]);
    this.guestTransfers.set([]);
  }

  mapFrame(store: GiftStore): SafeResourceUrl | null {
    const url = storeMapEmbedUrl(store);
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }

  openStoreDialog(): void {
    this.editingStore.set(null);
    this.storeForm.reset({
      name: '',
      address: '',
      underName: this.user()?.name ?? '',
      note: '',
      socialUrl: '',
      mapUrl: '',
    });
    this.storeDialog.set(true);
  }

  editStore(index: number): void {
    const store = this.guestStores()[index];
    if (!store) return;
    this.editingStore.set(index);
    this.storeForm.reset({
      name: store.name,
      address: store.address,
      underName: store.underName,
      note: store.note,
      socialUrl: store.socialUrl ?? '',
      mapUrl: store.mapUrl ?? '',
    });
    this.storeDialog.set(true);
  }

  onStoreDialog(open: boolean): void {
    this.storeDialog.set(open);
  }

  onStoreDialogHide(): void {
    this.editingStore.set(null);
    void this.storeClosed.flush();
  }

  async confirmStore(): Promise<void> {
    if (this.storeForm.invalid) {
      this.storeForm.markAllAsTouched();
      return;
    }
    const previous = this.guestStores();
    const value = this.storeForm.getRawValue();
    const store: GiftStore = {
      name: value.name.trim(),
      address: value.address.trim(),
      hours: '',
      underName: value.underName.trim(),
      note: value.note.trim(),
      socialUrl: storeSocialHref(value.socialUrl) ?? '',
      mapUrl: storeSocialHref(value.mapUrl) ?? '',
    };
    const index = this.editingStore();
    const next = index === null ? [...previous, store] : previous.map((item, itemIndex) => (itemIndex === index ? store : item));
    if (!(await this.saveGuestOptions(next, this.guestTransfers()))) return;
    this.storeClosed.queue(async () => {
      this.guestStores.set(next);
      if (!this.storeDialog()) this.toast.show('Guardado');
    });
    this.storeDialog.set(false);
  }

  async removeStore(index: number): Promise<void> {
    const previous = this.guestStores();
    const next = previous.filter((_, item) => item !== index);
    if (!(await this.saveGuestOptions(next, this.guestTransfers()))) return;
    afterOverlayGone(this.destroyRef, () => {
      this.guestStores.set(next);
      this.toast.show('Guardado');
    });
  }

  openTransferDialog(): void {
    this.editingTransfer.set(null);
    this.transferError.set(null);
    this.transferForm.reset({ holder: '', bank: '', alias: '', cbu: '' });
    this.transferDialog.set(true);
  }

  editTransfer(index: number): void {
    const account = this.guestTransfers()[index];
    if (!account) return;
    this.editingTransfer.set(index);
    this.transferError.set(null);
    this.transferForm.reset(account);
    this.transferDialog.set(true);
  }

  onTransferDialog(open: boolean): void {
    this.transferDialog.set(open);
  }

  onTransferDialogHide(): void {
    this.editingTransfer.set(null);
    void this.transferClosed.flush();
  }

  async confirmTransfer(): Promise<void> {
    const value = this.transferForm.getRawValue();
    if (!value.alias.trim() && !value.cbu.trim()) {
      this.transferError.set('Ingresá un alias o un CBU.');
      return;
    }
    const previous = this.guestTransfers();
    const index = this.editingTransfer();
    const next = index === null ? [...previous, value] : previous.map((account, item) => (item === index ? value : account));
    if (!(await this.saveGuestOptions(this.guestStores(), next))) return;
    this.transferClosed.queue(async () => {
      this.guestTransfers.set(next);
      if (!this.transferDialog()) this.toast.show('Guardado');
    });
    this.transferDialog.set(false);
  }

  async removeTransfer(index: number): Promise<void> {
    const previous = this.guestTransfers();
    const next = previous.filter((_, item) => item !== index);
    if (!(await this.saveGuestOptions(this.guestStores(), next))) return;
    afterOverlayGone(this.destroyRef, () => {
      this.guestTransfers.set(next);
      this.toast.show('Guardado');
    });
  }

  private setGuestOptions(list: GiftList): void {
    const options = list.guestOptions ?? emptyGuestOptions();
    this.guestStores.set(options.stores.map((store) => ({ ...store })));
    this.guestTransfers.set(options.transfers.map((account) => ({ ...account })));
  }

  async changeStatus(gift: Gift, event: SelectChangeEvent): Promise<void> {
    const status = event.value as GiftStatus;
    if (!status || status === gift.status) return;
    if (status === 'RESERVED') {
      this.openReserveForm(gift);
      this.statusReset.update((value) => value + 1);
      return;
    }
    try {
      await this.giftsApi.setStatus(gift.id, status);
      const current = this.selected();
      if (current) await this.loadList(current);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos cambiar el estado.');
    }
  }

  openReserveForm(gift: Gift): void {
    const person = this.activeReservation(gift.id);
    this.reserveError.set(null);
    this.reserveForm.reset({
      name: person?.name ?? '',
      phone: person?.phone ?? '',
      email: person?.email ?? '',
      message: person?.message ?? '',
    });
    this.reservationGift.set(null);
    this.reserveDraft.set(gift);
    this.reserveVisible.set(true);
  }

  onReserveVisible(open: boolean): void {
    this.reserveVisible.set(open);
  }

  onReserveDialogHide(): void {
    void this.reserveClosed.flush();
    this.reserveVisible.set(false);
    queueMicrotask(() => this.reserveDraft.set(null));
  }

  async confirmOwnerReserve(): Promise<void> {
    const gift = this.reserveDraft();
    if (!gift) return;
    this.reserveForm.markAllAsTouched();
    if (this.reserveForm.invalid) return;
    const value = this.reserveForm.getRawValue();
    this.reserveSaving.set(true);
    this.reserveError.set(null);
    try {
      await this.reservationsApi.recordAsOwner(gift.id, value);
      const current = this.selected();
      this.reserveClosed.queue(async () => {
        if (current) await this.loadList(current);
        if (!this.reserveVisible()) this.toast.show('Reserva guardada');
      });
      this.reserveVisible.set(false);
    } catch (error) {
      this.reserveError.set(error instanceof Error ? error.message : 'No pudimos guardar la reserva.');
    } finally {
      this.reserveSaving.set(false);
    }
  }

  async confirmDelete(accepted: boolean): Promise<void> {
    const gift = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!accepted || !gift) return;
    try {
      await this.giftsApi.remove(gift.id);
      const current = this.selected();
      afterOverlayGone(this.destroyRef, async () => {
        if (current) await this.loadList(current);
        this.toast.show('Regalo eliminado');
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos eliminar el regalo.');
    }
  }

  shareUrl(): string {
    const list = this.selected();
    return list ? `${this.origin}/${list.slug}` : this.origin;
  }

  async copyLink(): Promise<void> {
    await navigator.clipboard.writeText(this.shareUrl());
    this.toast.show('Link copiado');
  }

  shareWhatsapp(): void {
    const list = this.selected();
    const text = `Te comparto mi lista en regali.to: ${list?.title ?? ''}\n${this.shareUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  shareFacebook(): void {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.shareUrl())}`, '_blank', 'noopener');
  }

  async shareInstagram(): Promise<void> {
    await this.copyLink();
    window.open('https://www.instagram.com/', '_blank', 'noopener');
  }
}

function requiredText(control: AbstractControl): ValidationErrors | null {
  return `${control.value ?? ''}`.trim() ? null : { required: true };
}

function optionalWebUrl(control: AbstractControl): ValidationErrors | null {
  const value = `${control.value ?? ''}`.trim();
  if (!value) return null;
  return storeSocialHref(value) ? null : { url: true };
}

function requiredWebUrl(control: AbstractControl): ValidationErrors | null {
  const value = `${control.value ?? ''}`.trim();
  if (!value) return { required: true };
  return storeSocialHref(value) ? null : { url: true };
}
