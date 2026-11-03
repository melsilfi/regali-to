export type GiftStatus = 'AVAILABLE' | 'RESERVED' | 'RECEIVED';
export type ReservationStatus = 'ACTIVE' | 'CANCELLED';
export type GiftPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type GiftEventType = 'created' | 'status_changed' | 'reserved' | 'cancelled';
export type GiftSuggestionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface GiftStore {
  name: string;
  address: string;
  hours: string;
  underName: string;
  note: string;
  socialUrl: string;
  mapUrl: string;
}

export function storeMapHref(store: Pick<GiftStore, 'mapUrl' | 'address'>): string | null {
  const direct = storeSocialHref(store.mapUrl);
  if (direct) return direct;
  const address = store.address.trim();
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function storeMapEmbedUrl(store: Pick<GiftStore, 'mapUrl' | 'address'>): string | null {
  const query = store.address.trim() || store.mapUrl.trim();
  if (!query) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&hl=es&output=embed`;
}

export function storeSocialHref(value: string | undefined): string | null {
  const raw = `${value ?? ''}`.trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export interface GiftTransfer {
  holder: string;
  bank: string;
  alias: string;
  cbu: string;
}

export interface GuestOptions {
  stores: GiftStore[];
  transfers: GiftTransfer[];
}

export function emptyGuestOptions(): GuestOptions {
  return { stores: [], transfers: [] };
}

export interface GiftList {
  id: string;
  userId: string;
  ownerName: string;
  slug: string;
  title: string;
  description: string | null;
  eventDate: string | null;
  coverImage: string | null;
  isPublic: boolean;
  guestOptions: GuestOptions;
  createdAt: string;
}

export interface Gift {
  id: string;
  listId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  estimatedPrice: number | null;
  externalUrl: string | null;
  priority: GiftPriority | null;
  status: GiftStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Reservation {
  id: string;
  giftId: string;
  giftName: string;
  giftStatus: GiftStatus;
  listId: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: ReservationStatus;
  createdAt: string;
}

export interface ReservationConfirmation {
  reservationId: string;
  giftName: string;
  reservedAt: string;
}

export interface OwnerNotification {
  id: string;
  recipient: string;
  person: string;
  phone: string;
  email: string | null;
  gift: string;
  date: string;
  message: string | null;
  listTitle: string;
}

export interface GiftEvent {
  id: string;
  giftId: string;
  giftName: string;
  listId: string;
  eventType: GiftEventType;
  fromStatus: GiftStatus | null;
  toStatus: GiftStatus | null;
  detail: string | null;
  createdAt: string;
}

export interface GiftListInput {
  ownerName: string;
  slug: string;
  title: string;
  description: string;
  eventDate: string;
  coverImage: string | null;
  guestOptions: GuestOptions;
}

export interface GiftInput {
  name: string;
  description: string;
  imageUrl: string | null;
  estimatedPrice: number | null;
  externalUrl: string;
  priority: GiftPriority | null;
}

export interface GiftSuggestion {
  id: string;
  giftId: string;
  listId: string;
  name: string;
  url: string | null;
  price: number | null;
  note: string | null;
  guestName: string;
  guestEmail: string | null;
  status: GiftSuggestionStatus;
  createdAt: string;
  giftName?: string;
}

export interface GiftSuggestionInput {
  name: string;
  url: string;
  price: number | null;
  note: string;
  guestName: string;
  guestEmail: string;
}

export interface StoreVisit {
  id: string;
  listId: string;
  storeName: string;
  buyer: string;
  amount: string;
  note: string;
  dedication: string | null;
  createdAt: string;
}

export interface TransferNotice {
  id: string;
  listId: string;
  destination: string;
  buyer: string;
  dedication: string | null;
  createdAt: string;
}

export interface ReservationInput {
  name: string;
  phone: string;
  email: string;
  message: string;
  consent: boolean;
}

export interface GiftCounts {
  total: number;
  available: number;
  reserved: number;
  received: number;
}
