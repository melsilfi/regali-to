import { Gift, GiftCounts, GiftPriority, GiftStatus } from './models';

const STATUS_RANK: Record<GiftStatus, number> = {
  AVAILABLE: 0,
  RESERVED: 1,
  RECEIVED: 2,
};

const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, (month ?? 1) - 1, day ?? 1));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function countGifts(gifts: Gift[]): GiftCounts {
  return gifts.reduce<GiftCounts>(
    (counts, gift) => {
      counts.total += 1;
      if (gift.status === 'AVAILABLE') counts.available += 1;
      if (gift.status === 'RESERVED') counts.reserved += 1;
      if (gift.status === 'RECEIVED') counts.received += 1;
      return counts;
    },
    { total: 0, available: 0, reserved: 0, received: 0 },
  );
}

export function sortGifts(gifts: Gift[]): Gift[] {
  return [...gifts].sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    const aPriority = a.priority ? PRIORITY_RANK[a.priority] : 3;
    const bPriority = b.priority ? PRIORITY_RANK[b.priority] : 3;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function priorityLabel(priority: GiftPriority | null): string {
  if (priority === 'HIGH') return 'Alta';
  if (priority === 'LOW') return 'Baja';
  return 'Media';
}

export function statusLabel(status: GiftStatus): string {
  if (status === 'AVAILABLE') return 'Disponible';
  if (status === 'RESERVED') return 'Reservado';
  return 'Recibido';
}
