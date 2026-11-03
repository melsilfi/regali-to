import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GiftListsService, MAX_GIFT_LISTS } from '../../../core/lists/gift-lists.service';
import { AuthService } from '../../../core/auth/auth.service';
import { DashboardTabs } from '../../../core/ui/notification-center';
import { ToastService } from '../../../core/ui/toast.service';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

@Component({
  selector: 'app-side-nav',
  imports: [RouterLink, NotificationBellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'side-nav',
    '[class.side-nav-collapsed]': 'collapsed()',
  },
  templateUrl: './side-nav.component.html',
})
export class SideNavComponent implements OnInit {
  private readonly listsApi = inject(GiftListsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dashboardTabs = inject(DashboardTabs);
  private readonly toast = inject(ToastService);

  readonly collapsed = signal(readCollapsed());
  readonly lists = this.listsApi.catalog;
  readonly selectedId = computed(() => this.listsApi.selectedId() ?? this.lists()[0]?.id ?? null);
  readonly historyOpen = computed(() => this.dashboardTabs.active() === 'historial' && !this.onReservations());
  readonly onReservations = signal(this.router.url.startsWith('/panel/reservas'));

  ngOnInit(): void {
    void this.listsApi.mine().catch(() => undefined);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.onReservations.set(event.urlAfterRedirects.startsWith('/panel/reservas')));
  }

  toggle(): void {
    this.collapsed.update((value) => !value);
    localStorage.setItem('mlr-nav-collapsed', this.collapsed() ? '1' : '0');
  }

  pick(listId: string): void {
    this.listsApi.select(listId);
    this.dashboardTabs.showGeneral();
    this.collapseOnPhone();
    void this.router.navigateByUrl('/panel');
  }

  openHistory(): void {
    this.dashboardTabs.showHistory();
    this.collapseOnPhone();
    void this.router.navigateByUrl('/panel');
  }

  addList(): void {
    if (this.lists().length >= MAX_GIFT_LISTS) {
      this.toast.warn('Podés tener hasta 5 listas. Para crear otra, borrá una de las que ya tenés.');
      return;
    }
    this.listsApi.pendingCreate.set(true);
    this.dashboardTabs.showGeneral();
    this.collapseOnPhone();
    void this.router.navigateByUrl('/panel');
  }

  private collapseOnPhone(): void {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches || this.collapsed()) return;
    this.collapsed.set(true);
    localStorage.setItem('mlr-nav-collapsed', '1');
  }

  cover(src: string | null): string {
    return src || '/ejemplos/regalo.jpg';
  }

  async logout(): Promise<void> {
    this.listsApi.catalog.set([]);
    this.listsApi.pendingCreate.set(false);
    this.listsApi.clearSelection();
    await this.auth.signOut();
    await this.router.navigateByUrl('/');
  }
}

function readCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const saved = localStorage.getItem('mlr-nav-collapsed');
  if (saved === '1') return true;
  if (saved === '0') return false;
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}
