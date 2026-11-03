import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Button } from 'primeng/button';
import { Gift, GiftSuggestionInput } from '../../../core/models';

@Component({
  selector: 'app-suggest-dialog',
  imports: [ReactiveFormsModule, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suggest-dialog.component.html',
})
export class SuggestDialogComponent {
  readonly gift = input.required<Gift>();
  readonly submitting = input(false);
  readonly error = input<string | null>(null);
  readonly example = input(false);
  readonly confirmed = output<GiftSuggestionInput>();
  readonly dismissed = output<void>();

  private readonly formBuilder = inject(FormBuilder);
  readonly formError = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    guestName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    guestEmail: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    url: ['', [Validators.maxLength(500)]],
    note: ['', [Validators.maxLength(400)]],
  });

  submit(): void {
    if (this.example()) return;
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const url = value.url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      this.formError.set('El link tiene que empezar con https://');
      return;
    }
    this.confirmed.emit({
      guestName: value.guestName,
      guestEmail: value.guestEmail.trim(),
      name: value.name,
      url,
      price: null,
      note: value.note,
    });
  }

  close(): void {
    if (!this.submitting()) this.dismissed.emit();
  }
}
