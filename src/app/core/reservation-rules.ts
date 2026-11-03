import { ReservationInput } from './models';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

const RESERVATION_RULES: Record<keyof ReservationInput, { invalid: (input: ReservationInput) => boolean; message: string }> = {
  name: {
    invalid: (input) => {
      const name = input.name.trim();
      return name.length < 3 || name.length > 80;
    },
    message: 'Ingresá nombre y apellido.',
  },
  phone: {
    invalid: (input) => {
      const phoneDigits = digitsOnly(input.phone);
      return phoneDigits.length < 8 || phoneDigits.length > 15;
    },
    message: 'Ingresá un teléfono válido.',
  },
  email: {
    invalid: (input) => !EMAIL_PATTERN.test(input.email.trim()),
    message: 'Ingresá un email para enviarte la confirmación.',
  },
  message: {
    invalid: (input) => input.message.trim().length > 400,
    message: 'El mensaje puede tener hasta 400 caracteres.',
  },
  consent: {
    invalid: (input) => !input.consent,
    message: 'Confirmá que vas a comprar este regalo.',
  },
};

export function validateReservationInput(input: ReservationInput): string | null {
  const failed = Object.values(RESERVATION_RULES).find((rule) => rule.invalid(input));
  return failed?.message ?? null;
}
