import { Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DemoStore } from '../demo/demo-store';
import { userError } from '../errors';
import { OwnerNotification, Reservation, ReservationConfirmation, ReservationInput } from '../models';
import { validateReservationInput } from '../reservation-rules';
import { ApiService } from '../api/api.service';

interface ReservationRow {
  id: string;
  gift_id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: Reservation['status'];
  created_at: string;
  gift_name: string;
  gift_status: Reservation['giftStatus'];
  list_id: string;
}

@Injectable({ providedIn: 'root' })
export class ReservationsService {
  constructor(
    private readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly demo: DemoStore,
  ) {}

  async reserve(giftId: string, input: ReservationInput): Promise<ReservationConfirmation> {
    const validation = validateReservationInput(input);
    if (validation) throw new Error(validation);
    if (this.auth.isDemo || this.demo.isShowcaseGift(giftId)) {
      try {
        return this.demo.reserve({ ...input, giftId });
      } catch (error) {
        throw userError(error);
      }
    }

    const payload = await this.api.request<{ reservationId: string; giftName: string; reservedAt: string }>(
      `/api/gifts/${giftId}/reserve`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: input.name.trim(),
          phone: input.phone.trim(),
          email: input.email.trim(),
          message: input.message.trim(),
          consent: input.consent,
        }),
      },
    );
    return {
      reservationId: payload.reservationId,
      giftName: payload.giftName,
      reservedAt: payload.reservedAt,
    };
  }

  async recordAsOwner(giftId: string, input: Pick<ReservationInput, 'name' | 'phone' | 'email' | 'message'>): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('Necesitás iniciar sesión.');
    const name = input.name.trim();
    const phone = input.phone.trim();
    const email = input.email.trim();
    const message = input.message.trim();
    if (name.length < 3 || name.length > 80) throw new Error('Ingresá nombre y apellido.');
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15) throw new Error('Ingresá un teléfono válido.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresá un email válido.');
    if (message.length > 400) throw new Error('El mensaje puede tener hasta 400 caracteres.');
    if (this.auth.isDemo || this.demo.isShowcaseGift(giftId)) {
      this.demo.ownerReserve(user.id, giftId, { name, phone, email, message });
      return;
    }
    await this.api.request(`/api/gifts/${giftId}/owner-reserve`, {
      method: 'POST',
      body: JSON.stringify({ name, phone, email, message }),
    });
  }

  async forOwner(): Promise<Reservation[]> {
    const user = this.auth.user();
    if (!user) return [];
    if (this.auth.isDemo) return this.demo.reservationsForUser(user.id);
    const data = await this.api.request<ReservationRow[]>('/api/reservations');
    return data.map(mapReservation);
  }

  async cancel(reservationId: string): Promise<void> {
    const user = this.auth.user();
    if (!user) throw new Error('Necesitás iniciar sesión.');
    if (this.auth.isDemo) {
      this.demo.cancelReservation(user.id, reservationId);
      return;
    }
    await this.api.request(`/api/reservations/${reservationId}/cancel`, { method: 'POST' });
  }

  async notifications(): Promise<OwnerNotification[]> {
    const user = this.auth.user();
    if (!user) return [];
    const latest = (await this.forOwner()).filter((item) => item.status === 'ACTIVE').slice(0, 5);
    return latest.map((item) => ({
      id: item.id,
      recipient: user.email,
      person: item.name,
      phone: item.phone,
      email: item.email,
      gift: item.giftName,
      date: item.createdAt,
      message: item.message,
      listTitle: '',
    }));
  }
}

function mapReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    giftId: row.gift_id,
    giftName: row.gift_name ?? 'Regalo',
    giftStatus: row.gift_status ?? 'RESERVED',
    listId: row.list_id ?? '',
    name: row.name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}
