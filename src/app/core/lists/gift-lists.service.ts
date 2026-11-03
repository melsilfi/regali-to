import { Injectable, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DemoStore, EXAMPLE_SLUG } from '../demo/demo-store';
import { userError } from '../errors';
import { emptyGuestOptions, GiftList, GiftListInput, GiftStore, GiftTransfer, GuestOptions, storeSocialHref } from '../models';
import { ApiService } from '../api/api.service';

export const MAX_GIFT_LISTS = 5;

interface GiftListRow {
  id: string;
  user_id: string;
  owner_name: string;
  slug: string;
  title: string;
  description: string | null;
  event_date: string | null;
  cover_image: string | null;
  is_public: boolean;
  guest_options: GuestOptions | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class GiftListsService {
  readonly selectedId = signal<string | null>(this.readSelected());
  readonly catalog = signal<GiftList[]>([]);
  readonly pendingCreate = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly demo: DemoStore,
  ) {}

  async mine(): Promise<GiftList[]> {
    const user = this.requireUser();
    if (this.auth.isDemo) {
      const lists = this.demo.listsForUser(user.id);
      this.catalog.set(lists);
      return lists;
    }
    const data = await this.api.request<GiftListRow[]>('/api/lists');
    const lists = data.map((row) => rememberGuestOptions(mapList(row)));
    this.catalog.set(lists);
    return lists;
  }

  async publicBySlug(slug: string): Promise<GiftList | null> {
    if (this.auth.isDemo || slug === EXAMPLE_SLUG) return this.demo.publicList(slug);
    const data = await this.api.request<GiftListRow | null>(`/api/lists/public/${encodeURIComponent(slug)}`);
    return data ? rememberGuestOptions(mapList(data)) : null;
  }

  async create(input: GiftListInput): Promise<GiftList> {
    const user = this.requireUser();
    if (this.catalog().length >= MAX_GIFT_LISTS) {
      throw new Error('Podés tener hasta 5 listas. Para crear otra, borrá una de las que ya tenés.');
    }
    if (this.auth.isDemo) {
      try {
        const list = this.demo.createList(user, input);
        this.select(list.id);
        return list;
      } catch (error) {
        throw userError(error);
      }
    }
    const data = await this.api.request<GiftListRow>('/api/lists', {
      method: 'POST',
      body: JSON.stringify(listBody(input)),
    });
    const list = rememberGuestOptions(mapList(data));
    this.select(list.id);
    return list;
  }

  async update(listId: string, input: GiftListInput): Promise<GiftList> {
    const user = this.requireUser();
    if (this.auth.isDemo) {
      try {
        return this.demo.updateList(user.id, listId, input);
      } catch (error) {
        throw userError(error);
      }
    }
    const data = await this.api.request<GiftListRow>(`/api/lists/${listId}`, {
      method: 'PATCH',
      body: JSON.stringify(listBody(input)),
    });
    const list = mapList(data);
    const options = input.guestOptions ?? list.guestOptions;
    writeGuestOptions(list.id, options);
    return { ...list, guestOptions: options };
  }

  async remove(listId: string): Promise<void> {
    const user = this.requireUser();
    if (this.auth.isDemo) {
      this.demo.deleteList(user.id, listId);
      return;
    }
    await this.api.request(`/api/lists/${listId}`, { method: 'DELETE' });
  }

  clearSelection(): void {
    this.selectedId.set(null);
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('mlr-selected-list');
  }

  select(listId: string): void {
    this.selectedId.set(listId);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('mlr-selected-list', listId);
    }
  }

  private requireUser() {
    const user = this.auth.user();
    if (!user) throw new Error('Necesitás iniciar sesión.');
    return user;
  }

  private readSelected(): string | null {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem('mlr-selected-list');
  }
}

function mapList(row: GiftListRow): GiftList {
  return {
    id: row.id,
    userId: row.user_id,
    ownerName: row.owner_name,
    slug: row.slug,
    title: row.title,
    description: row.description,
    eventDate: row.event_date,
    coverImage: row.cover_image,
    isPublic: row.is_public,
    guestOptions: readGuestOptions(row.guest_options),
    createdAt: row.created_at,
  };
}

function listBody(input: GiftListInput) {
  return {
    ownerName: input.ownerName.trim(),
    slug: input.slug.trim().toLowerCase(),
    title: input.title.trim(),
    description: input.description.trim() || null,
    eventDate: input.eventDate || null,
    coverImage: input.coverImage,
    guestOptions: input.guestOptions ?? emptyGuestOptions(),
  };
}

const GUEST_OPTIONS_KEY = 'mlr-guest-options';

function readGuestOptionsStore(): Record<string, GuestOptions> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_OPTIONS_KEY) ?? '{}') as Record<string, GuestOptions>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeGuestOptions(listId: string, options: GuestOptions): void {
  if (typeof localStorage === 'undefined') return;
  const store = readGuestOptionsStore();
  store[listId] = options;
  localStorage.setItem(GUEST_OPTIONS_KEY, JSON.stringify(store));
}

function rememberGuestOptions(list: GiftList): GiftList {
  const hasOptions = list.guestOptions.stores.length > 0 || list.guestOptions.transfers.length > 0;
  if (hasOptions) {
    writeGuestOptions(list.id, list.guestOptions);
    return list;
  }
  const stored = readGuestOptionsStore()[list.id];
  return stored ? { ...list, guestOptions: stored } : list;
}

function readGuestOptions(value: GuestOptions | null | undefined): GuestOptions {
  const stores = Array.isArray(value?.stores) ? value.stores.map(readStore) : [];
  const transfers = Array.isArray(value?.transfers) ? value.transfers.map(readTransfer) : [];
  return { stores, transfers };
}

function readStore(value: Partial<GiftStore>): GiftStore {
  return {
    name: String(value.name ?? ''),
    address: String(value.address ?? ''),
    hours: String(value.hours ?? ''),
    underName: String(value.underName ?? ''),
    note: String(value.note ?? ''),
    socialUrl: storeSocialHref(value.socialUrl) ?? '',
    mapUrl: storeSocialHref(value.mapUrl) ?? '',
  };
}

function readTransfer(value: Partial<GiftTransfer>): GiftTransfer {
  return {
    holder: String(value.holder ?? ''),
    bank: String(value.bank ?? ''),
    alias: String(value.alias ?? ''),
    cbu: String(value.cbu ?? ''),
  };
}
