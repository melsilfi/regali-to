import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DemoStore } from '../demo/demo-store';
import { ApiService } from '../api/api.service';
import { Gift, GiftEvent, GiftInput, GiftStatus } from '../models';

interface GiftRow {
  id: string;
  list_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  estimated_price: number | null;
  external_url: string | null;
  priority: Gift['priority'];
  status: GiftStatus;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  gift_id: string;
  event_type: GiftEvent['eventType'];
  payload: { name?: string; from?: GiftStatus; to?: GiftStatus; detail?: string; listId?: string };
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class GiftsService {
  constructor(
    private readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly demo: DemoStore,
  ) {}

  async forList(listId: string): Promise<Gift[]> {
    if (this.auth.isDemo || this.demo.isShowcaseList(listId)) return this.demo.giftsForList(listId);
    return this.api.request<GiftRow[]>(`/api/lists/${listId}/gifts`).then((rows) => rows.map(mapGift));
  }

  async byId(giftId: string): Promise<Gift | null> {
    if (this.auth.isDemo) {
      const user = this.auth.user();
      return user ? this.demo.giftForUser(user.id, giftId) : null;
    }
    const data = await this.api.request<GiftRow | null>(`/api/gifts/${giftId}`);
    return data ? mapGift(data) : null;
  }

  async create(listId: string, input: GiftInput): Promise<Gift> {
    const user = this.requireUser();
    if (this.auth.isDemo) return this.demo.createGift(user.id, listId, input);
    const data = await this.api.request<GiftRow>(`/api/lists/${listId}/gifts`, {
      method: 'POST',
      body: JSON.stringify(toBody(input)),
    });
    return mapGift(data);
  }

  async update(giftId: string, input: GiftInput): Promise<Gift> {
    const user = this.requireUser();
    if (this.auth.isDemo) return this.demo.updateGift(user.id, giftId, input);
    const data = await this.api.request<GiftRow>(`/api/gifts/${giftId}`, {
      method: 'PATCH',
      body: JSON.stringify(toBody(input)),
    });
    return mapGift(data);
  }

  async remove(giftId: string): Promise<void> {
    const user = this.requireUser();
    if (this.auth.isDemo) {
      this.demo.deleteGift(user.id, giftId);
      return;
    }
    await this.api.request(`/api/gifts/${giftId}`, { method: 'DELETE' });
  }

  async setStatus(giftId: string, status: GiftStatus): Promise<void> {
    const user = this.requireUser();
    if (this.auth.isDemo) {
      this.demo.setStatus(user.id, giftId, status);
      return;
    }
    await this.api.request(`/api/gifts/${giftId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  async activityForLists(listIds: string[]): Promise<GiftEvent[]> {
    if (listIds.length === 0) return [];
    if (this.auth.isDemo) {
      return listIds
        .flatMap((listId) => this.demo.eventsForList(listId))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
    const giftIds = (await this.api.request<{ id: string }[]>(`/api/lists/${listIds[0]}/gifts`)).map((row) => row.id);
    const extra = await Promise.all(listIds.slice(1).map((listId) => this.api.request<{ id: string }[]>(`/api/lists/${listId}/gifts`)));
    return this.history(listIds[0], [...giftIds, ...extra.flat().map((row) => row.id)]);
  }

  async history(listId: string, giftIds: string[]): Promise<GiftEvent[]> {
    if (this.auth.isDemo) return this.demo.eventsForList(listId);
    if (giftIds.length === 0) return [];
    const data = await this.api.request<EventRow[]>(`/api/events?giftIds=${encodeURIComponent(giftIds.join(','))}`);
    return data.map((row) => ({
      id: row.id,
      giftId: row.gift_id,
      giftName: row.payload.name ?? 'Regalo',
      listId: row.payload.listId ?? listId,
      eventType: row.event_type,
      fromStatus: row.payload.from ?? null,
      toStatus: row.payload.to ?? null,
      detail: row.payload.detail ?? null,
      createdAt: row.created_at,
    }));
  }

  async uploadImage(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Elegí una imagen.');
    if (file.size > 5 * 1024 * 1024) throw new Error('La imagen puede pesar hasta 5 MB.');
    if (this.auth.isDemo) return readFile(file);
    const body = new FormData();
    body.set('file', file);
    const result = await this.api.request<{ url: string }>('/api/uploads', { method: 'POST', body });
    return result.url;
  }

  private requireUser() {
    const user = this.auth.user();
    if (!user) throw new Error('Necesitás iniciar sesión.');
    return user;
  }
}

function mapGift(row: GiftRow): Gift {
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    estimatedPrice: row.estimated_price,
    externalUrl: row.external_url,
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBody(input: GiftInput) {
  return {
    name: input.name.trim(),
    description: input.description.trim() || null,
    imageUrl: input.imageUrl,
    estimatedPrice: input.estimatedPrice,
    externalUrl: input.externalUrl.trim() || null,
    priority: input.priority,
  };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No pudimos leer la imagen.'));
    reader.readAsDataURL(file);
  });
}
