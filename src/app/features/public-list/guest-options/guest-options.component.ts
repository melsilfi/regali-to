import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { GuestActivityService } from '../../../core/guest-activity/guest-activity.service';
import { GiftStore, GiftTransfer, GuestOptions, storeMapEmbedUrl, storeMapHref, storeSocialHref } from '../../../core/models';
import { afterOverlayGone } from '../../../core/ui/after-close';
import { ToastService } from '../../../core/ui/toast.service';

@Component({
  selector: 'app-guest-options',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './guest-options.component.html',
})
export class GuestOptionsComponent {
  readonly options = input.required<GuestOptions>();
  readonly listId = input.required<string>();
  readonly section = input.required<'stores' | 'transfers'>();
  readonly example = input(false);

  readonly visitError = signal<string | null>(null);
  readonly transferError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly copied = signal<string | null>(null);
  readonly copyMenu = signal<string | null>(null);
  readonly copyMenuPos = signal({ top: 0, left: 0, width: 180 });
  readonly storeOpen = signal<GiftStore | null>(null);
  readonly storeSocialHref = storeSocialHref;
  readonly storeMapHref = storeMapHref;

  mapFrame(store: GiftStore): SafeResourceUrl | null {
    const url = storeMapEmbedUrl(store);
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }
  readonly transferOpen = signal<GiftTransfer | null>(null);

  private readonly formBuilder = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly activity = inject(GuestActivityService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly visitForm = this.formBuilder.nonNullable.group({
    buyer: ['', [Validators.required, Validators.minLength(3)]],
    note: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(400)]],
    dedication: ['', Validators.maxLength(280)],
  });
  readonly transferForm = this.formBuilder.nonNullable.group({
    buyer: ['', [Validators.required, Validators.minLength(3)]],
    dedication: ['', Validators.maxLength(280)],
  });

  openStore(store: GiftStore): void {
    this.visitError.set(null);
    this.visitForm.reset({ buyer: '', note: '', dedication: '' });
    this.storeOpen.set(store);
  }

  openTransfer(account: GiftTransfer): void {
    this.transferError.set(null);
    this.transferForm.reset({ buyer: '', dedication: '' });
    this.transferOpen.set(account);
  }

  async submitVisit(): Promise<void> {
    const store = this.storeOpen();
    if (!store) return;
    this.visitForm.markAllAsTouched();
    if (this.visitForm.invalid) return;
    const value = this.visitForm.getRawValue();
    const dedication = value.dedication.trim();
    this.saving.set(true);
    this.visitError.set(null);
    try {
      await this.activity.addVisit(
        {
          listId: this.listId(),
          storeName: store.name,
          buyer: value.buyer.trim(),
          amount: '',
          note: value.note.trim(),
          dedication: dedication || null,
        },
        this.example(),
      );
      this.storeOpen.set(null);
      afterOverlayGone(this.destroyRef, () => {
        this.toast.celebrate(`Ya avisamos que reservaste en el local ${store.name}`);
      });
    } catch (error) {
      this.visitError.set(error instanceof Error ? error.message : 'No pudimos guardar el aviso.');
    } finally {
      this.saving.set(false);
    }
  }

  async submitTransfer(): Promise<void> {
    const account = this.transferOpen();
    if (!account) return;
    this.transferForm.markAllAsTouched();
    if (this.transferForm.invalid) return;
    const value = this.transferForm.getRawValue();
    const dedication = value.dedication.trim();
    const destination = account.alias || account.holder || 'la cuenta';
    this.saving.set(true);
    this.transferError.set(null);
    try {
      await this.activity.addTransfer(
        {
          listId: this.listId(),
          destination,
          buyer: value.buyer.trim(),
          dedication: dedication || null,
        },
        this.example(),
      );
      this.transferOpen.set(null);
      afterOverlayGone(this.destroyRef, () => {
        this.toast.celebrate('Ya notificamos tu transferencia');
      });
    } catch (error) {
      this.transferError.set(error instanceof Error ? error.message : 'No pudimos guardar el aviso.');
    } finally {
      this.saving.set(false);
    }
  }

  copyKey(account: GiftTransfer): string {
    return `${account.alias}|${account.cbu}`;
  }

  openCopy(): GiftTransfer | null {
    const key = this.copyMenu();
    if (!key) return null;
    return this.options().transfers.find((account) => this.copyKey(account) === key) ?? null;
  }

  toggleCopy(account: GiftTransfer, event: Event): void {
    const key = this.copyKey(account);
    if (this.copyMenu() === key) {
      this.copyMenu.set(null);
      return;
    }
    const button = event.currentTarget;
    if (button instanceof HTMLElement) {
      const rect = button.getBoundingClientRect();
      const width = Math.max(rect.width, 176);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const height = 96;
      const below = rect.bottom + 6;
      const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
      this.copyMenuPos.set({ top, left, width });
    }
    this.copyMenu.set(key);
  }

  @HostListener('document:click', ['$event'])
  closeCopyMenu(event: MouseEvent): void {
    if (!this.copyMenu()) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.copy-menu-wrap, .copy-menu')) return;
    this.copyMenu.set(null);
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  hideCopyMenu(): void {
    this.copyMenu.set(null);
  }

  copyTransfer(value: string): void {
    void navigator.clipboard.writeText(value).then(() => {
      this.copied.set(value);
      this.copyMenu.set(null);
    });
  }
}
