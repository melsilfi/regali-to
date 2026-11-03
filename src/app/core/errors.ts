export function mapBackendError(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? '';
  const code = error?.code ?? '';
  if (message.includes('ALREADY_RESERVED')) {
    return 'Otra persona acaba de reservar este regalo.';
  }
  if (message.includes('CONSENT_REQUIRED')) {
    return 'Confirmá que vas a comprar este regalo.';
  }
  if (message.includes('INVALID_NAME')) return 'Ingresá nombre y apellido.';
  if (message.includes('INVALID_PHONE')) return 'Ingresá un teléfono válido.';
  if (message.includes('INVALID_EMAIL')) return 'El email no parece válido.';
  if (message.includes('GIFT_NOT_FOUND') || message.includes('LIST_NOT_FOUND')) {
    return 'No encontramos ese regalo.';
  }
  if (message.includes('LIST_NOT_PUBLIC')) return 'Esta lista no está publicada.';
  if (message.includes('SLUG_RESERVED') || message.includes('SLUG_INVALID')) {
    return 'Ese link no se puede usar.';
  }
  if (code === '23505' || message.includes('gift_lists_slug')) {
    return 'Ese link ya está en uso. Elegí otro.';
  }
  if (message.includes('Invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (message.includes('User already registered')) {
    return 'Ya existe una cuenta con ese email.';
  }
  if (message.includes('guest_options')) {
    return 'La lista se puede guardar, pero los locales y las transferencias todavía no están en la base.';
  }
  if (message.includes('gift_suggestions')) {
    return 'Las sugerencias todavía no están en la base de datos.';
  }
  if (/provider is not enabled|unsupported provider/i.test(message)) {
    return 'El ingreso con Google no está activado.';
  }
  return 'No pudimos completar la acción. Probá de nuevo.';
}

export function userError(error: unknown): Error {
  const candidate = (error ?? {}) as { message?: string; code?: string };
  return new Error(mapBackendError(candidate));
}
