import { Injectable } from '@angular/core';
import { EXAMPLE_GUEST_OPTIONS } from './example-gift-options';
import { emptyGuestOptions, Gift, GiftEvent, GiftInput, GiftList, GiftListInput, GiftSuggestion, GiftSuggestionInput, GuestOptions, OwnerNotification, Reservation, ReservationConfirmation, ReservationInput, SessionUser, storeSocialHref } from '../models';

export interface DemoState {
  users: Array<SessionUser & { password: string }>;
  sessionUserId: string | null;
  lists: GiftList[];
  gifts: Gift[];
  reservations: Reservation[];
  events: GiftEvent[];
  notifications: OwnerNotification[];
  suggestions: GiftSuggestion[];
}

const STORAGE_KEY = 'mi-lista-de-regalos-demo';
export const EXAMPLE_SLUG = 'lauraynicoweddinglist';

function id(): string {
  return crypto.randomUUID();
}

function seed(): DemoState {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const listId = '22222222-2222-4222-8222-222222222222';
  const now = '2026-09-20T13:00:00.000Z';
  const gifts: Gift[] = [
    gift(listId, 'Cafetera Oster', 'Cafetera espresso automática para las mañanas lentas.', 150000, 'HIGH', 'AVAILABLE', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80', now),
    gift(listId, 'Auriculares inalámbricos', 'Para escuchar música mientras cocina.', 89000, 'MEDIUM', 'AVAILABLE', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80', now),
    gift(listId, 'Cena para dos', 'Una salida sin apuro, en un lugar que elijan ustedes.', 60000, 'HIGH', 'RESERVED', 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80', now),
    gift(listId, 'Manta de lino', 'Color arena, para el sillón del living.', 45000, 'LOW', 'AVAILABLE', 'https://images.unsplash.com/photo-1543294001-f7cd5d7fb516?auto=format&fit=crop&w=1200&q=80', now),
    gift(listId, 'Libro de cocina', 'Recetas simples, de las que se hacen un domingo.', 28000, null, 'RECEIVED', 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80', now),
    gift(listId, 'Planta grande', 'Alguna que sobreviva con poco sol.', 35000, 'MEDIUM', 'AVAILABLE', 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=1200&q=80', now),
    gift(listId, 'Clase de cerámica', 'Un taller para los dos, un sábado a la tarde.', 40000, null, 'RESERVED', 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1200&q=80', now),
    gift(listId, 'Set de copas', 'Copas finas, para brindar tranquilos en casa.', 52000, 'LOW', 'AVAILABLE', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80', now),
  ];

  const dinner = gifts[2];
  const workshop = gifts[6];
  const book = gifts[4];

  return {
    users: [
      {
        id: ownerId,
        name: 'Laura y Nico',
        email: 'laura.nico@gmail.com',
        password: 'demo1234',
      },
    ],
    sessionUserId: null,
    lists: [
      {
        id: listId,
        userId: ownerId,
        ownerName: 'Laura y Nico',
        slug: EXAMPLE_SLUG,
        title: 'Lista de regalos de Laura y Nico',
        description:
          'Si querés hacernos un regalo, armamos esta lista para ayudarte a elegir algo que realmente nos gustaría recibir.',
        eventDate: '2026-11-14',
        coverImage:
          'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=80',
        isPublic: true,
        guestOptions: EXAMPLE_GUEST_OPTIONS,
        createdAt: now,
      },
    ],
    gifts,
    reservations: [
      reservation(dinner, listId, 'Juan Pérez', '2494-555010', 'juan@email.com', 'La compro esta semana.', '2026-10-01T13:42:00.000Z'),
      reservation(workshop, listId, 'Ana Gómez', '2494-555018', null, null, '2026-10-02T18:05:00.000Z'),
      {
        ...reservation(book, listId, 'Martín Ruiz', '2494-555021', 'martin@email.com', 'Ya se los dejé.', '2026-09-28T15:10:00.000Z'),
        giftStatus: 'RECEIVED',
      },
    ],
    events: [
      ...gifts.map((item) => event(item, 'created', null, item.status, 'Se agregó a la lista', item.createdAt)),
      event(dinner, 'reserved', 'AVAILABLE', 'RESERVED', 'Juan Pérez lo reservó', '2026-10-01T13:42:00.000Z'),
      event(workshop, 'reserved', 'AVAILABLE', 'RESERVED', 'Ana Gómez lo reservó', '2026-10-02T18:05:00.000Z'),
      event(book, 'status_changed', 'RESERVED', 'RECEIVED', 'Marcado como recibido', '2026-10-03T11:00:00.000Z'),
    ],
    suggestions: [],
    notifications: [
      {
        id: id(),
        recipient: 'laura.nico@gmail.com',
        person: 'Ana Gómez',
        phone: '2494-555018',
        email: null,
        gift: 'Clase de cerámica',
        date: '2026-10-02T18:05:00.000Z',
        message: null,
        listTitle: 'Lista de regalos de Laura y Nico',
      },
    ],
  };
}

function gift(
  listId: string,
  name: string,
  description: string,
  price: number,
  priority: Gift['priority'],
  status: Gift['status'],
  imageUrl: string,
  createdAt: string,
): Gift {
  return {
    id: id(),
    listId,
    name,
    description,
    imageUrl,
    estimatedPrice: price,
    externalUrl: 'https://www.google.com/search?q=' + encodeURIComponent(name),
    priority,
    status,
    createdAt,
    updatedAt: createdAt,
  };
}

function reservation(
  item: Gift,
  listId: string,
  name: string,
  phone: string,
  email: string | null,
  message: string | null,
  createdAt: string,
): Reservation {
  return {
    id: id(),
    giftId: item.id,
    giftName: item.name,
    giftStatus: item.status,
    listId,
    name,
    phone,
    email,
    message,
    status: 'ACTIVE',
    createdAt,
  };
}

function event(
  item: Gift,
  eventType: GiftEvent['eventType'],
  fromStatus: GiftEvent['fromStatus'],
  toStatus: GiftEvent['toStatus'],
  detail: string,
  createdAt: string,
): GiftEvent {
  return {
    id: id(),
    giftId: item.id,
    giftName: item.name,
    listId: item.listId,
    eventType,
    fromStatus,
    toStatus,
    detail,
    createdAt,
  };
}

@Injectable({ providedIn: 'root' })
export class DemoStore {
  private state: DemoState = this.read();

  currentUser(): SessionUser | null {
    const user = this.state.users.find((item) => item.id === this.state.sessionUserId);
    return user ? { id: user.id, name: user.name, email: user.email } : null;
  }

  signIn(email: string, password: string): SessionUser {
    const user = this.state.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) {
      throw new Error('Invalid login credentials');
    }
    this.state.sessionUserId = user.id;
    this.persist();
    return { id: user.id, name: user.name, email: user.email };
  }

  signInDemoOwner(): SessionUser {
    const user = this.state.users[0];
    this.state.sessionUserId = user.id;
    this.persist();
    return { id: user.id, name: user.name, email: user.email };
  }

  signUp(name: string, email: string, password: string): SessionUser {
    if (this.state.users.some((item) => item.email.toLowerCase() === email.trim().toLowerCase())) {
      throw new Error('User already registered');
    }
    const user = { id: id(), name: name.trim(), email: email.trim().toLowerCase(), password };
    this.state.users.push(user);
    this.state.sessionUserId = user.id;
    this.persist();
    return { id: user.id, name: user.name, email: user.email };
  }

  signOut(): void {
    this.state.sessionUserId = null;
    this.persist();
  }

  listsForUser(userId: string): GiftList[] {
    return this.state.lists.filter((list) => list.userId === userId).map(presentList);
  }

  publicList(slug: string): GiftList | null {
    const list = this.state.lists.find((item) => item.slug === slug && item.isPublic);
    return list ? presentList(list) : null;
  }

  isShowcaseList(listId: string): boolean {
    return this.state.lists.some((list) => list.id === listId && list.slug === EXAMPLE_SLUG);
  }

  isShowcaseGift(giftId: string): boolean {
    const gift = this.state.gifts.find((item) => item.id === giftId);
    return !!gift && this.isShowcaseList(gift.listId);
  }

  createList(user: SessionUser, input: GiftListInput): GiftList {
    this.assertSlug(input.slug);
    const list: GiftList = {
      id: id(),
      userId: user.id,
      ownerName: input.ownerName.trim(),
      slug: input.slug.trim().toLowerCase(),
      title: input.title.trim(),
      description: input.description.trim() || null,
      eventDate: input.eventDate || null,
      coverImage: input.coverImage,
      isPublic: true,
      guestOptions: cleanGuestOptions(input.guestOptions),
      createdAt: new Date().toISOString(),
    };
    this.state.lists.unshift(list);
    this.persist();
    return list;
  }

  updateList(userId: string, listId: string, input: GiftListInput): GiftList {
    const list = this.ownedList(userId, listId);
    if (list.slug !== input.slug.trim().toLowerCase()) {
      this.assertSlug(input.slug);
    }
    list.ownerName = input.ownerName.trim();
    list.slug = input.slug.trim().toLowerCase();
    list.title = input.title.trim();
    list.description = input.description.trim() || null;
    list.eventDate = input.eventDate || null;
    list.coverImage = input.coverImage;
    list.guestOptions = cleanGuestOptions(input.guestOptions);
    this.persist();
    return list;
  }

  deleteList(userId: string, listId: string): void {
    this.ownedList(userId, listId);
    const giftIds = new Set(this.state.gifts.filter((gift) => gift.listId === listId).map((gift) => gift.id));
    this.state.lists = this.state.lists.filter((list) => list.id !== listId);
    this.state.gifts = this.state.gifts.filter((gift) => gift.listId !== listId);
    this.state.reservations = this.state.reservations.filter((item) => item.listId !== listId);
    this.state.events = this.state.events.filter((item) => !giftIds.has(item.giftId));
    this.state.suggestions = this.suggestionList().filter((item) => item.listId !== listId);
    this.persist();
  }

  giftsForList(listId: string): Gift[] {
    return this.state.gifts.filter((gift) => gift.listId === listId);
  }

  giftForUser(userId: string, giftId: string): Gift | null {
    const current = this.state.gifts.find((item) => item.id === giftId);
    if (!current) return null;
    const list = this.state.lists.find((item) => item.id === current.listId && item.userId === userId);
    return list ? current : null;
  }

  createGift(userId: string, listId: string, input: GiftInput): Gift {
    this.ownedList(userId, listId);
    const now = new Date().toISOString();
    const created: Gift = {
      id: id(),
      listId,
      name: input.name.trim(),
      description: input.description.trim() || null,
      imageUrl: input.imageUrl,
      estimatedPrice: input.estimatedPrice,
      externalUrl: input.externalUrl.trim() || null,
      priority: input.priority,
      status: 'AVAILABLE',
      createdAt: now,
      updatedAt: now,
    };
    this.state.gifts.unshift(created);
    this.pushEvent(created, 'created', null, 'AVAILABLE', 'Se agregó a la lista');
    this.persist();
    return created;
  }

  updateGift(userId: string, giftId: string, input: GiftInput): Gift {
    const current = this.ownedGift(userId, giftId);
    current.name = input.name.trim();
    current.description = input.description.trim() || null;
    current.imageUrl = input.imageUrl;
    current.estimatedPrice = input.estimatedPrice;
    current.externalUrl = input.externalUrl.trim() || null;
    current.priority = input.priority;
    current.updatedAt = new Date().toISOString();
    this.state.reservations
      .filter((item) => item.giftId === current.id)
      .forEach((item) => {
        item.giftName = current.name;
      });
    this.persist();
    return current;
  }

  deleteGift(userId: string, giftId: string): void {
    this.ownedGift(userId, giftId);
    this.state.gifts = this.state.gifts.filter((item) => item.id !== giftId);
    this.state.reservations = this.state.reservations.filter((item) => item.giftId !== giftId);
    this.state.events = this.state.events.filter((item) => item.giftId !== giftId);
    this.state.suggestions = this.suggestionList().filter((item) => item.giftId !== giftId);
    this.persist();
  }

  setStatus(userId: string, giftId: string, status: Gift['status']): void {
    const current = this.ownedGift(userId, giftId);
    const previous = current.status;
    if (previous === status) return;
    if (status === 'AVAILABLE') {
      this.state.reservations
        .filter((item) => item.giftId === giftId && item.status === 'ACTIVE')
        .forEach((item) => {
          item.status = 'CANCELLED';
          item.giftStatus = 'AVAILABLE';
        });
    }
    current.status = status;
    current.updatedAt = new Date().toISOString();
    this.state.reservations
      .filter((item) => item.giftId === giftId && item.status === 'ACTIVE')
      .forEach((item) => {
        item.giftStatus = status;
      });
    this.pushEvent(current, 'status_changed', previous, status, 'El estado cambió');
    this.persist();
  }

  ownerReserve(userId: string, giftId: string, input: Pick<ReservationInput, 'name' | 'phone' | 'email' | 'message'>): void {
    const current = this.ownedGift(userId, giftId);
    const list = this.state.lists.find((item) => item.id === current.listId);
    const previous = current.status;
    const createdAt = new Date().toISOString();
    this.state.reservations
      .filter((item) => item.giftId === giftId && item.status === 'ACTIVE')
      .forEach((item) => {
        item.status = 'CANCELLED';
        item.giftStatus = 'AVAILABLE';
      });
    const reservation: Reservation = {
      id: id(),
      giftId: current.id,
      giftName: current.name,
      giftStatus: 'RESERVED',
      listId: current.listId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email.trim() || null,
      message: input.message.trim() || null,
      status: 'ACTIVE',
      createdAt,
    };
    current.status = 'RESERVED';
    current.updatedAt = createdAt;
    this.state.reservations.unshift(reservation);
    this.pushEvent(current, 'reserved', previous, 'RESERVED', `${reservation.name} lo reservó`);
    const owner = this.state.users.find((item) => item.id === list?.userId);
    this.state.notifications.unshift({
      id: id(),
      recipient: owner?.email ?? '',
      person: reservation.name,
      phone: reservation.phone,
      email: reservation.email,
      gift: current.name,
      date: createdAt,
      message: reservation.message,
      listTitle: list?.title ?? '',
    });
    this.persist();
  }

  reserve(input: ReservationInput & { giftId: string }): ReservationConfirmation {
    const current = this.state.gifts.find((item) => item.id === input.giftId);
    const list = current ? this.state.lists.find((item) => item.id === current.listId) : undefined;
    if (!current || !list || !list.isPublic) {
      throw new Error('GIFT_NOT_FOUND');
    }
    if (current.status !== 'AVAILABLE') {
      throw new Error('ALREADY_RESERVED');
    }
    const createdAt = new Date().toISOString();
    const reservation: Reservation = {
      id: id(),
      giftId: current.id,
      giftName: current.name,
      giftStatus: 'RESERVED',
      listId: list.id,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email.trim() || null,
      message: input.message.trim() || null,
      status: 'ACTIVE',
      createdAt,
    };
    current.status = 'RESERVED';
    current.updatedAt = createdAt;
    this.state.reservations.unshift(reservation);
    this.pushEvent(current, 'reserved', 'AVAILABLE', 'RESERVED', `${reservation.name} lo reservó`);
    const owner = this.state.users.find((item) => item.id === list.userId);
    this.state.notifications.unshift({
      id: id(),
      recipient: owner?.email ?? '',
      person: reservation.name,
      phone: reservation.phone,
      email: reservation.email,
      gift: current.name,
      date: createdAt,
      message: reservation.message,
      listTitle: list.title,
    });
    this.persist();
    return { reservationId: reservation.id, giftName: current.name, reservedAt: createdAt };
  }

  reservationsForUser(userId: string): Reservation[] {
    const listIds = new Set(this.listsForUser(userId).map((list) => list.id));
    return this.state.reservations
      .filter((item) => listIds.has(item.listId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  cancelReservation(userId: string, reservationId: string): void {
    const reservation = this.reservationsForUser(userId).find((item) => item.id === reservationId);
    if (!reservation || reservation.status !== 'ACTIVE') return;
    reservation.status = 'CANCELLED';
    reservation.giftStatus = 'AVAILABLE';
    const current = this.state.gifts.find((item) => item.id === reservation.giftId);
    if (current) {
      const previous = current.status;
      current.status = 'AVAILABLE';
      current.updatedAt = new Date().toISOString();
      this.pushEvent(current, 'cancelled', previous, 'AVAILABLE', 'La reserva se canceló');
    }
    this.persist();
  }

  eventsForList(listId: string): GiftEvent[] {
    return this.state.events
      .filter((item) => item.listId === listId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  notificationsForUser(userId: string): OwnerNotification[] {
    const titles = new Set(this.listsForUser(userId).map((list) => list.title));
    return this.state.notifications.filter((item) => titles.has(item.listTitle));
  }

  private ownedList(userId: string, listId: string): GiftList {
    const list = this.state.lists.find((item) => item.id === listId && item.userId === userId);
    if (!list) throw new Error('LIST_NOT_FOUND');
    return list;
  }

  private ownedGift(userId: string, giftId: string): Gift {
    const current = this.state.gifts.find((item) => item.id === giftId);
    if (!current) throw new Error('GIFT_NOT_FOUND');
    this.ownedList(userId, current.listId);
    return current;
  }

  private assertSlug(slug: string): void {
    const normalized = slug.trim().toLowerCase();
    if (this.state.lists.some((list) => list.slug === normalized)) {
      throw Object.assign(new Error('gift_lists_slug'), { code: '23505' });
    }
  }

  suggestionsForList(listId: string): GiftSuggestion[] {
    return this.suggestionList()
      .filter((item) => item.listId === listId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  addSuggestion(gift: Gift, input: GiftSuggestionInput): void {
    if (gift.status === 'RECEIVED') throw new Error('Este regalo ya llegó.');
    this.suggestionList().unshift({
      id: id(),
      giftId: gift.id,
      listId: gift.listId,
      name: input.name.trim(),
      url: input.url.trim() || null,
      price: input.price,
      note: input.note.trim() || null,
      guestName: input.guestName.trim(),
      guestEmail: input.guestEmail.trim(),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    this.persist();
  }

  decideSuggestion(userId: string, suggestionId: string, accept: boolean): void {
    const suggestion = this.suggestionList().find((item) => item.id === suggestionId);
    if (!suggestion || suggestion.status !== 'PENDING') throw new Error('La sugerencia ya no está pendiente.');
    const gift = this.ownedGift(userId, suggestion.giftId);
    if (accept) {
      gift.name = suggestion.name;
      if (suggestion.url) gift.externalUrl = suggestion.url;
      if (suggestion.price != null) gift.estimatedPrice = suggestion.price;
      gift.updatedAt = new Date().toISOString();
      this.state.reservations
        .filter((item) => item.giftId === gift.id)
        .forEach((item) => {
          item.giftName = gift.name;
        });
    }
    suggestion.status = accept ? 'ACCEPTED' : 'REJECTED';
    this.persist();
  }

  private suggestionList(): GiftSuggestion[] {
    if (!this.state.suggestions) this.state.suggestions = [];
    return this.state.suggestions;
  }

  private pushEvent(
    item: Gift,
    eventType: GiftEvent['eventType'],
    fromStatus: GiftEvent['fromStatus'],
    toStatus: GiftEvent['toStatus'],
    detail: string,
  ): void {
    this.state.events.unshift({
      id: id(),
      giftId: item.id,
      giftName: item.name,
      listId: item.listId,
      eventType,
      fromStatus,
      toStatus,
      detail,
      createdAt: new Date().toISOString(),
    });
  }

  private read(): DemoState {
    if (typeof localStorage === 'undefined') return seed();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    try {
      const parsed = JSON.parse(raw) as DemoState;
      parsed.suggestions ??= [];
      return this.withShowcase(parsed);
    } catch {
      return seed();
    }
  }

  private withShowcase(state: DemoState): DemoState {
    const existing = state.lists.find((list) => list.slug === EXAMPLE_SLUG);
    if (existing) {
      existing.guestOptions = presentList(existing).guestOptions;
      return state;
    }
    const sample = seed();
    const sampleList = sample.lists[0];
    state.lists.push(sampleList);
    state.gifts.push(...sample.gifts.filter((gift) => gift.listId === sampleList.id));
    state.reservations.push(...sample.reservations.filter((item) => item.listId === sampleList.id));
    state.events.push(...sample.events.filter((item) => item.listId === sampleList.id));
    this.state = state;
    this.persist();
    return state;
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }
}

function presentList(list: GiftList): GiftList {
  const options = cleanGuestOptions(list.guestOptions);
  const hasOptions = options.stores.length > 0 || options.transfers.length > 0;
  if (list.slug === EXAMPLE_SLUG && !hasOptions) {
    return { ...list, guestOptions: EXAMPLE_GUEST_OPTIONS };
  }
  return { ...list, guestOptions: options };
}

function cleanGuestOptions(options: GuestOptions | undefined): GuestOptions {
  if (!options) return emptyGuestOptions();
  return {
    stores: (options.stores ?? [])
      .filter((store) => store.name.trim())
      .map((store) => ({
        name: store.name.trim(),
        address: store.address.trim(),
        hours: store.hours.trim(),
        underName: store.underName.trim(),
        note: store.note.trim(),
        socialUrl: storeSocialHref(store.socialUrl) ?? '',
        mapUrl: storeSocialHref(store.mapUrl) ?? '',
      })),
    transfers: (options.transfers ?? [])
      .filter((account) => `${account.alias ?? ''}`.trim() || `${account.cbu ?? ''}`.trim())
      .map((account) => ({
        holder: `${account.holder ?? ''}`.trim(),
        bank: `${account.bank ?? ''}`.trim(),
        alias: `${account.alias ?? ''}`.trim(),
        cbu: `${account.cbu ?? ''}`.trim(),
      })),
  };
}
