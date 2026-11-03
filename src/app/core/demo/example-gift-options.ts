import { GuestOptions } from '../models';

export const EXAMPLE_OWNER_EMAIL = 'laura.nico@gmail.com';

export const EXAMPLE_GUEST_OPTIONS: GuestOptions = {
  stores: [
    {
      name: 'Casa de Regalos Palermo',
      address: 'Av. Santa Fe 3251, Palermo, CABA',
      hours: 'Lunes a sábado, de 10 a 19',
      underName: 'Laura y Nico',
      note: 'La lista está a nuestro nombre. En el local podés elegir el regalo y decir que es para el casamiento.',
      socialUrl: '',
      mapUrl: '',
    },
  ],
  transfers: [
    {
      holder: 'Laura Fernández',
      bank: 'Banco de ejemplo',
      alias: 'LAURA.NICO.LISTA',
      cbu: '0000003100098765432101',
    },
  ],
};
