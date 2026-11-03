import { validateReservationInput } from './reservation-rules';

describe('validateReservationInput', () => {
  const valid = {
    name: 'Juan Pérez',
    phone: '2494-555010',
    email: 'juan@email.com',
    message: '',
    consent: true,
  };

  it('acepta nombre, teléfono y consentimiento', () => {
    expect(validateReservationInput(valid)).toBeNull();
  });

  it('exige el consentimiento', () => {
    expect(validateReservationInput({ ...valid, consent: false })).toContain('comprar');
  });

  it('rechaza un teléfono corto', () => {
    expect(validateReservationInput({ ...valid, phone: '123' })).toContain('teléfono');
  });

  it('exige el email del invitado', () => {
    expect(validateReservationInput({ ...valid, email: '' })).toContain('email');
  });
});
