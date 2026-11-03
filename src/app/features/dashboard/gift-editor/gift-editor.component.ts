import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button } from 'primeng/button';
import { Select } from 'primeng/select';
import { imageFileFromClipboard } from '../../../core/image-clipboard';
import { LoadingImageComponent } from '../../../shared/ui/loading-image/loading-image.component';
import { GiftListsService } from '../../../core/lists/gift-lists.service';
import { GiftPriority } from '../../../core/models';
import { GiftsService } from '../../../core/gifts/gifts.service';

@Component({
  selector: 'app-gift-editor',
  imports: [ReactiveFormsModule, RouterLink, Button, Select, LoadingImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gift-editor.component.html',
})
export class GiftEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly giftsApi = inject(GiftsService);
  private readonly listsApi = inject(GiftListsService);
  private readonly formBuilder = inject(FormBuilder);

  readonly modal = input(false);
  readonly linkedId = input<string | null>(null, { alias: 'giftId' });
  readonly saved = output<void>();
  readonly dismissed = output<void>();
  readonly priorityOptions = [
    { label: 'Alta', value: 'HIGH' },
    { label: 'Media', value: 'MEDIUM' },
    { label: 'Baja', value: 'LOW' },
  ];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly giftId = signal<string | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly hasList = computed(() => !!this.activeListId());
  private originListId: string | null = null;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(22)]],
    description: ['', Validators.maxLength(80)],
    externalUrl: ['', [Validators.required, productUrl]],
    priority: ['MEDIUM'],
  });

  private activeListId(): string | null {
    return this.listsApi.selectedId() ?? this.listsApi.catalog()[0]?.id ?? null;
  }

  backToList(): void {
    const listId = this.originListId ?? this.listsApi.selectedId();
    if (listId) this.listsApi.select(listId);
  }

  async ngOnInit(): Promise<void> {
    const giftId = this.modal() ? this.linkedId() : this.route.snapshot.paramMap.get('giftId');
    if (!giftId) return;
    this.giftId.set(giftId);
    const gift = await this.giftsApi.byId(giftId);
    if (!gift) {
      this.error.set('No encontramos ese regalo.');
      return;
    }
    this.originListId = gift.listId;
    this.listsApi.select(gift.listId);
    this.imageUrl.set(gift.imageUrl);
    this.form.patchValue({
      name: gift.name,
      description: gift.description ?? '',
      externalUrl: gift.externalUrl ?? '',
      priority: gift.priority ?? 'MEDIUM',
    });
  }

  async onImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.uploadImage(file);
  }

  @HostListener('document:paste', ['$event'])
  async onImagePaste(event: ClipboardEvent): Promise<void> {
    if (this.uploading()) return;
    const file = imageFileFromClipboard(event);
    if (!file) return;
    event.preventDefault();
    await this.uploadImage(file);
  }

  private async uploadImage(file: File): Promise<void> {
    this.uploading.set(true);
    this.error.set(null);
    try {
      this.imageUrl.set(await this.giftsApi.uploadImage(file));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos subir la imagen.');
    } finally {
      this.uploading.set(false);
    }
  }

  clearImage(): void {
    this.imageUrl.set(null);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const listId = this.activeListId();
    if (!listId) {
      this.error.set('Primero creá una lista.');
      return;
    }
    if (this.listsApi.selectedId() !== listId) this.listsApi.select(listId);
    const raw = this.form.getRawValue();
    const externalUrl = raw.externalUrl.trim();
    const input = {
      name: raw.name,
      description: raw.description,
      imageUrl: this.imageUrl(),
      estimatedPrice: null,
      externalUrl,
      priority: (raw.priority || 'MEDIUM') as GiftPriority,
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.giftId();
      if (id) await this.giftsApi.update(id, input);
      else await this.giftsApi.create(listId, input);
      if (this.modal()) this.saved.emit();
      else await this.router.navigateByUrl('/panel');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos guardar el regalo.');
    } finally {
      this.saving.set(false);
    }
  }
}

function productUrl(control: AbstractControl): ValidationErrors | null {
  const value = `${control.value ?? ''}`.trim();
  if (!value) return null;
  return /^https?:\/\/\S+$/i.test(value) ? null : { url: true };
}
