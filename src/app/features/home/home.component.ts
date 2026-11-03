import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { GiftListsService } from '../../core/lists/gift-lists.service';
import { DashboardTabs } from '../../core/ui/notification-center';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.component.html',
})
export class HomeComponent {
  readonly loggedIn = inject(AuthService).user;
  private readonly listsApi = inject(GiftListsService);
  private readonly dashboardTabs = inject(DashboardTabs);
  private readonly router = inject(Router);

  async openFirstList(): Promise<void> {
    this.dashboardTabs.showGeneral();
    try {
      const lists = await this.listsApi.mine();
      if (lists[0]) this.listsApi.select(lists[0].id);
    } catch {
      // El panel muestra el error si no se pueden cargar las listas.
    }
    await this.router.navigateByUrl('/panel');
  }
}
