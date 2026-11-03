import { Injectable } from '@angular/core';
import { ApiService } from '../api/api.service';
import { StoreVisit, TransferNotice } from '../models';

const STORAGE_KEY = 'mlr-guest-activity';

interface GuestActivityStore {
  stores: StoreVisit[];
  transfers: TransferNotice[];
}

interface StoreVisitRow {
  id: string;
  list_id: string;
  store_name: string;
  buyer: string;
  amount: string;
  note: string;
  dedication: string | null;
  created_at: string;
}

interface TransferNoticeRow {
  id: string;
  list_id: string;
  destination: string;
  buyer: string;
  dedication: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class GuestActivityService {
  constructor(private readonly api: ApiService) {}

  async visits(listId: string): Promise<StoreVisit[]> {
    const local = this.localVisits(listId);
    try {
      const data = await this.api.request<StoreVisitRow[]>(`/api/lists/${listId}/visits`);
      return merge(local, data.map(mapVisit));
    } catch {
      return local;
    }
  }

  async transfers(listId: string): Promise<TransferNotice[]> {
    const local = this.localTransfers(listId);
    try {
      const data = await this.api.request<TransferNoticeRow[]>(`/api/lists/${listId}/transfers`);
      return merge(local, data.map(mapTransfer));
    } catch {
      return local;
    }
  }

  async addVisit(input: Omit<StoreVisit, 'id' | 'createdAt'>, localOnly = false): Promise<'remote' | 'local'> {
    if (localOnly) {
      this.rememberVisit(input);
      return 'local';
    }
    try {
      await this.api.request(`/api/lists/${input.listId}/visits`, {
        method: 'POST',
        body: JSON.stringify({
          storeName: input.storeName,
          buyer: input.buyer,
          amount: input.amount,
          note: input.note,
          dedication: input.dedication,
        }),
      });
      return 'remote';
    } catch {
      this.rememberVisit(input);
      return 'local';
    }
  }

  async addTransfer(input: Omit<TransferNotice, 'id' | 'createdAt'>, localOnly = false): Promise<'remote' | 'local'> {
    if (localOnly) {
      this.rememberTransfer(input);
      return 'local';
    }
    try {
      await this.api.request(`/api/lists/${input.listId}/transfers`, {
        method: 'POST',
        body: JSON.stringify({
          destination: input.destination,
          buyer: input.buyer,
          dedication: input.dedication,
        }),
      });
      return 'remote';
    } catch {
      this.rememberTransfer(input);
      return 'local';
    }
  }

  private localVisits(listId: string): StoreVisit[] {
    return this.read().stores.filter((item) => item.listId === listId);
  }

  private localTransfers(listId: string): TransferNotice[] {
    return this.read().transfers.filter((item) => item.listId === listId);
  }

  private rememberVisit(input: Omit<StoreVisit, 'id' | 'createdAt'>): void {
    const store = this.read();
    store.stores.unshift({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    this.write(store);
  }

  private rememberTransfer(input: Omit<TransferNotice, 'id' | 'createdAt'>): void {
    const store = this.read();
    store.transfers.unshift({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    this.write(store);
  }

  private read(): GuestActivityStore {
    if (typeof localStorage === 'undefined') return { stores: [], transfers: [] };
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<GuestActivityStore>;
      return {
        stores: Array.isArray(parsed.stores) ? parsed.stores : [],
        transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
      };
    } catch {
      return { stores: [], transfers: [] };
    }
  }

  private write(store: GuestActivityStore): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
}

function merge<T extends { id: string; createdAt: string }>(local: T[], remote: T[]): T[] {
  const seen = new Set(remote.map((item) => item.id));
  return [...remote, ...local.filter((item) => !seen.has(item.id))].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function mapVisit(row: StoreVisitRow): StoreVisit {
  return {
    id: row.id,
    listId: row.list_id,
    storeName: row.store_name,
    buyer: row.buyer,
    amount: row.amount,
    note: row.note,
    dedication: row.dedication,
    createdAt: row.created_at,
  };
}

function mapTransfer(row: TransferNoticeRow): TransferNotice {
  return {
    id: row.id,
    listId: row.list_id,
    destination: row.destination,
    buyer: row.buyer,
    dedication: row.dedication,
    createdAt: row.created_at,
  };
}
