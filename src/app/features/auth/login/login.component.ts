import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly isDemo = this.auth.isDemo;
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async google(): Promise<void> {
    await this.run(() => this.auth.signInWithGoogle().then(() => this.goIfSession()));
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    await this.run(async () => {
      await this.auth.signIn(email, password);
      await this.router.navigateByUrl('/panel');
    });
  }

  private async goIfSession(): Promise<void> {
    if (this.auth.user()) await this.router.navigateByUrl('/panel');
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.submitting.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos ingresar.');
    } finally {
      this.submitting.set(false);
    }
  }
}
