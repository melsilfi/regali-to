import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DemoStore } from '../demo/demo-store';
import { ApiService } from '../api/api.service';
import { Gift, GiftSuggestion, GiftSuggestionInput, GiftSuggestionStatus } from '../models';

interface SuggestionRow {
  id: string;
  gift_id: string;
  list_id: string;
  name: string;
  url: string | null;
  price: number | null;
  note: string | null;
  guest_name: string;
  guest_email: string | null;
  status: GiftSuggestionStatus;
  created_at: string;
  gift_name?: string;
}

@Injectable({ providedIn: 'root' })
export class SuggestionsService {
  constructor(
    private readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly demo: DemoStore,
  ) {}

  async forList(listId: string): Promise<GiftSuggestion[]> {
    if (this.auth.isDemo) return this.demo.suggestionsForList(listId);
    const data = await this.api.request<SuggestionRow[]>(`/api/lists/${listId}/suggestions`);
    return data.map(mapSuggestion);
  }

  async pendingFor(listIds: string[]): Promise<GiftSuggestion[]> {
    if (!listIds.length) return [];
    if (this.auth.isDemo) {
      return listIds.flatMap((listId) => {
        const names = new Map(this.demo.giftsForList(listId).map((gift) => [gift.id, gift.name]));
        return this.demo
          .suggestionsForList(listId)
          .filter((item) => item.status === 'PENDING')
          .map((item) => ({ ...item, giftName: names.get(item.giftId) }));
      });
    }
    const data = await this.api.request<SuggestionRow[]>(`/api/suggestions/pending?listIds=${encodeURIComponent(listIds.join(','))}`);
    return data.map((row) => ({ ...mapSuggestion(row), giftName: row.gift_name }));
  }

  async suggest(gift: Gift, input: GiftSuggestionInput): Promise<void> {
    if (this.auth.isDemo || this.demo.isShowcaseGift(gift.id)) {
      this.demo.addSuggestion(gift, input);
      return;
    }
    await this.api.request(`/api/gifts/${gift.id}/suggestions`, {
      method: 'POST',
      body: JSON.stringify({
        name: input.name.trim(),
        url: input.url.trim() || null,
        price: input.price,
        note: input.note.trim() || null,
        guestName: input.guestName.trim(),
        guestEmail: input.guestEmail.trim(),
      }),
    });
  }

  async decide(suggestionId: string, accept: boolean): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('Necesitás iniciar sesión.');
    if (this.auth.isDemo) {
      this.demo.decideSuggestion(user.id, suggestionId, accept);
      return;
    }
    await this.api.request(`/api/suggestions/${suggestionId}/decide`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    });
  }
}

function mapSuggestion(row: SuggestionRow): GiftSuggestion {
  return {
    id: row.id,
    giftId: row.gift_id,
    listId: row.list_id,
    name: row.name,
    url: row.url,
    price: row.price,
    note: row.note,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    status: row.status,
    createdAt: row.created_at,
  };
}
