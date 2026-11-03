import { slugify, validateSlug } from './slug';

describe('slug', () => {
  it('arma un link continuo a partir de un nombre', () => {
    expect(slugify('Laura y Nico')).toBe('lauraynico');
  });

  it('acepta el link de un casamiento', () => {
    expect(validateSlug('lauraynicoweddinglist')).toBeNull();
  });

  it('rechaza rutas de la aplicación', () => {
    expect(validateSlug('panel')).toContain('reservado');
  });
});
