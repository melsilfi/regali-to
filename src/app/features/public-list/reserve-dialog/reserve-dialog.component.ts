import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Gift, ReservationInput } from '../../../core/models';
import { digitsOnly } from '../../../core/reservation-rules';

@Component({
  selector: 'app-reserve-dialog',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reserve-dialog.component.html',
})
export class ReserveDialogComponent {
  readonly gift = input.required<Gift>();
  readonly submitting = input(false);
  readonly error = input<string | null>(null);
  readonly example = input(false);
  readonly confirmed = output<ReservationInput>();
  readonly dismissed = output<void>();

  private readonly formBuilder = inject(FormBuilder);
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    phone: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    message: ['', [Validators.maxLength(400)]],
    consent: [false, [Validators.requiredTrue]],
  });

  submit(): void {
    if (this.example()) return;
    this.form.markAllAsTouched();
    const phone = this.form.controls.phone.value;
    if (digitsOnly(phone).length < 8) {
      this.form.controls.phone.setErrors({ phone: true });
    }
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.confirmed.emit({
      name: value.name,
      phone: value.phone,
      email: value.email,
      message: value.message,
      consent: value.consent,
    });
  }

  close(): void {
    if (!this.submitting()) this.dismissed.emit();
  }
}
