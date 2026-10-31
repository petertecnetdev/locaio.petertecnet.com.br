import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeaseIdempotencyKey } from '../src/services/leaseIdempotency.js';

const lease = {
  id: 42,
  contract_version: 3,
  starts_on: '2026-11-01',
  ends_on: '2027-10-31',
  rent_amount: '1850.00',
  due_day: 10,
  deposit_amount: '3700.00',
  deposit_months: 2,
};

test('repete a mesma chave para o mesmo cronograma contratual', async () => {
  const first = await createLeaseIdempotencyKey('schedule', lease);
  const retry = await createLeaseIdempotencyKey('schedule', { ...lease });
  assert.equal(first, retry);
});

test('gera chave diferente quando os termos financeiros mudam', async () => {
  const original = await createLeaseIdempotencyKey('schedule', lease);
  const adjusted = await createLeaseIdempotencyKey('schedule', { ...lease, rent_amount: '1950.00' });
  assert.notEqual(original, adjusted);
});

test('isola a chave por operação, cobrança e método de pagamento', async () => {
  const pix = await createLeaseIdempotencyKey('payment', lease, { charge: { id: 7, amount: '1850.00' }, method: 'pix' });
  const boleto = await createLeaseIdempotencyKey('payment', lease, { charge: { id: 7, amount: '1850.00' }, method: 'boleto' });
  const otherCharge = await createLeaseIdempotencyKey('payment', lease, { charge: { id: 8, amount: '1850.00' }, method: 'pix' });
  const manual = await createLeaseIdempotencyKey('mark-paid', lease, { charge: { id: 7, amount: '1850.00' }, method: 'pix' });
  assert.equal(new Set([pix, boleto, otherCharge, manual]).size, 4);
});

test('produz chave compatível com o middleware Laravel', async () => {
  const key = await createLeaseIdempotencyKey('mark-paid', lease, { charge: { id: 7, amount: '1850.00' }, method: 'transfer' });
  assert.match(key, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/);
  assert.ok(key.length <= 80);
});

test('rejeita operação ou identificadores inválidos antes da requisição', async () => {
  await assert.rejects(() => createLeaseIdempotencyKey('delete', lease), TypeError);
  await assert.rejects(() => createLeaseIdempotencyKey('schedule', { ...lease, id: null }), TypeError);
  await assert.rejects(() => createLeaseIdempotencyKey('payment', lease, { charge: { id: 7 }, method: 'cash' }), TypeError);
});
