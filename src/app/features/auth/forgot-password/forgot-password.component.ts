import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  readonly isDemo = this.auth.isDemo;
  readonly submitting = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);
  readonly resetting = signal(false);
  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: [''],
  });

  constructor() {
    if (typeof window !== 'undefined' && (window.location.hash.includes('type=recovery') || new URLSearchParams(window.location.search).has('token'))) {
      this.resetting.set(true);
      this.form.controls.password.addValidators([Validators.required, Validators.minLength(6)]);
    }
  }

  async submit(): Promise<void> {
    if (this.resetting()) {
      if (this.form.controls.password.invalid) {
        this.form.controls.password.markAsTouched();
        return;
      }
      this.submitting.set(true);
      try {
        await this.auth.updatePassword(this.form.controls.password.value);
        this.sent.set(true);
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'No pudimos actualizar la contraseña.');
      } finally {
        this.submitting.set(false);
      }
      return;
    }

    if (this.form.controls.email.invalid) {
      this.form.controls.email.markAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.sendPasswordReset(this.form.controls.email.value);
      this.sent.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos enviar el email.');
    } finally {
      this.submitting.set(false);
    }
  }
}
