import { Injectable, computed, inject, signal } from '@angular/core';
import { formatDateTime } from '../format';
import { GiftsService } from '../gifts/gifts.service';
import { GuestActivityService } from '../guest-activity/guest-activity.service';
import { GiftListsService } from '../lists/gift-lists.service';
import { AuthService } from '../auth/auth.service';
import { SuggestionsService } from '../suggestions/suggestions.service';
import { GiftEvent, GiftEventType, GiftStatus, GiftSuggestion, StoreVisit, TransferNotice } from '../models';

export interface BellNotice {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  icon: string;
  bubble: string;
  focus?: { listId: string; giftId: string };
}

const SEEN_KEY = 'mlr-seen-notices';

@Injectable({ providedIn: 'root' })
export class NotificationCenter {
  private readonly auth = inject(AuthService);
  private readonly listsApi = inject(GiftListsService);
  private readonly giftsApi = inject(GiftsService);
  private readonly activity = inject(GuestActivityService);
  private readonly suggestionsApi = inject(SuggestionsService);
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;

  readonly items = signal<BellNotice[]>([]);
  readonly focus = signal<{ listId: string; giftId: string; token: number } | null>(null);
  readonly seen = signal<Set<string>>(readSeen());
  readonly unread = computed(() => this.items().filter((item) => !this.seen().has(item.id)).length);
  readonly formatDateTime = formatDateTime;

  start(): void {
    void this.refresh();
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), 20000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.generation += 1;
    this.items.set([]);
  }

  async refresh(): Promise<void> {
    const ticket = ++this.generation;
    if (!this.auth.user()) {
      this.items.set([]);
      return;
    }
    try {
      const lists = await this.listsApi.mine();
      const titles = new Map(lists.map((list) => [list.id, list.title]));
      const listIds = lists.map((list) => list.id);
      const [events, visits, transfers, suggestions] = await Promise.all([
        this.giftsApi.activityForLists(listIds),
        Promise.all(listIds.map((listId) => this.activity.visits(listId))),
        Promise.all(listIds.map((listId) => this.activity.transfers(listId))),
        this.suggestionsApi.pendingFor(listIds).catch(() => [] as GiftSuggestion[]),
      ]);
      if (ticket !== this.generation) return;
      const notices = [
        ...events.filter((event) => event.eventType !== 'created').map((event) => toNotice(event, titles.get(event.listId))),
        ...visits.flat().map((visit) => toStoreNotice(visit, titles.get(visit.listId))),
        ...transfers.flat().map((notice) => toTransferNotice(notice, titles.get(notice.listId))),
        ...suggestions.map((suggestion) => toSuggestionNotice(suggestion, titles.get(suggestion.listId))),
      ];
      notices.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      this.items.set(notices.slice(0, 20));
    } catch {
      if (ticket === this.generation) this.items.set([]);
    }
  }

  openFocus(notice: BellNotice): void {
    if (!notice.focus) return;
    this.focus.set({ ...notice.focus, token: Date.now() });
  }

  markSeen(): void {
    const ids = this.items().map((item) => item.id);
    const next = [...Array.from(this.seen()), ...ids].slice(-300);
    this.seen.set(new Set(next));
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify(next));
    }
  }
}

function readSeen(): Set<string> {
  if (typeof sessionStorage === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

interface NoticeCopy {
  title: string;
  icon: string;
  bubble: string;
}

const NOTICE_BY_EVENT: Partial<Record<GiftEventType, NoticeCopy>> = {
  reserved: { title: 'Nueva reserva', icon: 'pi pi-gift', bubble: 'note-warn' },
  cancelled: { title: 'Reserva cancelada', icon: 'pi pi-times-circle', bubble: 'note-danger' },
};

const NOTICE_BY_STATUS: Partial<Record<GiftStatus, NoticeCopy>> = {
  RECEIVED: { title: 'Regalo recibido', icon: 'pi pi-check', bubble: 'note-info' },
  AVAILABLE: { title: 'Volvió a estar disponible', icon: 'pi pi-circle', bubble: 'note-success' },
};

const DEFAULT_NOTICE: NoticeCopy = {
  title: 'Cambió un regalo',
  icon: 'pi pi-history',
  bubble: 'note-info',
};

function toStoreNotice(visit: StoreVisit, listTitle?: string): BellNotice {
  const place = listTitle ? `${listTitle} · ` : '';
  const dedication = visit.dedication ? ` Dedicatoria: ${visit.dedication}` : '';
  const paid = visit.amount ? ` pagó ${visit.amount}` : '';
  return {
    id: visit.id,
    title: 'Reserva en un local',
    detail: `${place}${visit.storeName}: ${visit.buyer}${paid}. ${visit.note}${dedication}`,
    createdAt: visit.createdAt,
    icon: 'pi pi-shop',
    bubble: 'note-info',
  };
}

function toSuggestionNotice(suggestion: GiftSuggestion, listTitle?: string): BellNotice {
  const place = listTitle ? `${listTitle} · ` : '';
  const target = suggestion.giftName ? ` para ${suggestion.giftName}` : '';
  return {
    id: suggestion.id,
    title: 'Sugerencia para revisar',
    detail: `${place}${suggestion.guestName} sugirió ${suggestion.name}${target}.`,
    createdAt: suggestion.createdAt,
    icon: 'pi pi-sparkles',
    bubble: 'note-warn',
    focus: { listId: suggestion.listId, giftId: suggestion.giftId },
  };
}

function toTransferNotice(notice: TransferNotice, listTitle?: string): BellNotice {
  const place = listTitle ? `${listTitle} · ` : '';
  const dedication = notice.dedication ? ` Dedicatoria: ${notice.dedication}` : '';
  return {
    id: notice.id,
    title: 'Aviso de transferencia',
    detail: `${place}${notice.buyer} va a transferir a ${notice.destination}.${dedication}`,
    createdAt: notice.createdAt,
    icon: 'pi pi-wallet',
    bubble: 'note-warn',
  };
}

function toNotice(event: GiftEvent, listTitle?: string): BellNotice {
  const place = listTitle ? `${listTitle} · ` : '';
  const detail = `${place}${event.giftName}${event.detail ? `: ${event.detail}` : ''}`;
  const copy = NOTICE_BY_EVENT[event.eventType] ?? (event.toStatus && NOTICE_BY_STATUS[event.toStatus]) ?? DEFAULT_NOTICE;
  return { id: event.id, detail, createdAt: event.createdAt, ...copy };
}

export type DashboardTab = 'general' | 'locales' | 'transferencias' | 'historial';

@Injectable({ providedIn: 'root' })
export class DashboardTabs {
  readonly active = signal<DashboardTab>('general');

  showGeneral(): void {
    this.active.set('general');
  }

  showHistory(): void {
    this.active.set('historial');
  }

  select(value: string | number | undefined): void {
    if (value === 'general' || value === 'locales' || value === 'transferencias' || value === 'historial') this.active.set(value);
  }
}
