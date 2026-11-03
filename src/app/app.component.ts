import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { Toast } from 'primeng/toast';
import { AuthService } from './core/auth/auth.service';
import { ToastService } from './core/ui/toast.service';
import { SideNavComponent } from './shared/ui/side-nav/side-nav.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, Button, Toast, SideNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  go(path: string): void {
    void this.router.navigateByUrl(path);
  }
}
