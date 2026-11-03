import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly isDemo = this.auth.isDemo;
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async google(): Promise<void> {
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.signInWithGoogle();
      if (this.auth.user()) await this.router.navigateByUrl('/panel');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos crear la cuenta.');
    } finally {
      this.submitting.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await this.auth.signUp(name, email, password);
      if (result === 'confirm-email') {
        this.info.set('Te enviamos un email para confirmar la cuenta. Después vas a poder entrar.');
        return;
      }
      await this.router.navigateByUrl('/panel');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos crear la cuenta.');
    } finally {
      this.submitting.set(false);
    }
  }
}
