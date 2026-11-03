export const RESERVED_SLUGS = [
  'ingresar',
  'registro',
  'recuperar',
  'panel',
  'auth',
  'cuenta',
  'api',
] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-?[a-z0-9]+)*$/;

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
}

export function validateSlug(value: string): string | null {
  const slug = value.trim().toLowerCase();
  if (slug.length < 3) {
    return 'El link necesita al menos 3 caracteres.';
  }
  if (slug.length > 48) {
    return 'El link puede tener hasta 48 caracteres.';
  }
  if (!SLUG_PATTERN.test(slug)) {
    return 'Usá solo letras minúsculas y números. Podés incluir guiones.';
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return 'Ese link está reservado. Elegí otro.';
  }
  return null;
}
