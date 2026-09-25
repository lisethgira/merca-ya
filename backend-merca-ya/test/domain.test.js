const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, unitPrice, orderCode } = require('../src/utils/pricing');
const { isStrongPassword } = require('../src/utils/password');
const { slugify } = require('../src/utils/slug');

test('rechaza contraseñas débiles y acepta la política de MercaYa', () => {
  assert.equal(isStrongPassword('mercaya'), false);
  assert.equal(isStrongPassword('MercaYa2026*'), true);
});

test('calcula oferta, envío gratis y código de pedido', () => {
  assert.equal(unitPrice(189900, 159900), 159900);
  assert.equal(unitPrice(45000, null), 45000);
  const quote = summarize(
    [{ precio: 189900, precio_oferta: 159900, cantidad: 1 }],
    { envioBase: 8000, envioGratisDesde: 150000 }
  );
  assert.equal(quote.subtotal, 189900);
  assert.equal(quote.descuento, 30000);
  assert.equal(quote.costoEnvio, 0);
  assert.equal(quote.total, 159900);
  const small = summarize([{ precio: 45000, precio_oferta: null, cantidad: 1 }]);
  assert.equal(small.costoEnvio, 8000);
  assert.equal(small.total, 53000);
  assert.equal(orderCode(123, 2026), 'MY-2026-000123');
});

test('genera slugs sin tildes', () => {
  assert.equal(slugify('Audífonos Bluetooth X200'), 'audifonos-bluetooth-x200');
});
