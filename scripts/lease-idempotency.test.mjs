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

test('gera chave diferente quando a data de início ou o dia de vencimento mudam', async () => {
  const original = await createLeaseIdempotencyKey('schedule', lease);
  const movedStart = await createLeaseIdempotencyKey('schedule', { ...lease, starts_on: '2026-12-01' });
  const changedDueDay = await createLeaseIdempotencyKey('schedule', { ...lease, due_day: 31 });
  assert.notEqual(original, movedStart);
  assert.notEqual(original, changedDueDay);
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

test('reutiliza a chave ao reenviar a mesma versão contratual', async () => {
  const options = { version: 3, documentId: 'contract-uuid-42' };
  const first = await createLeaseIdempotencyKey('contract-send', lease, options);
  const retry = await createLeaseIdempotencyKey('contract-send', lease, { ...options });
  assert.equal(first, retry);
  assert.match(first, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/);
});

test('gera chave nova para outra versão ou documento contratual', async () => {
  const original = await createLeaseIdempotencyKey('contract-send', lease, { version: 3, documentId: 'contract-uuid-42' });
  const revisedVersion = await createLeaseIdempotencyKey('contract-send', lease, { version: 4, documentId: 'contract-uuid-42' });
  const newDocument = await createLeaseIdempotencyKey('contract-send', lease, { version: 3, documentId: 'contract-uuid-43' });
  assert.notEqual(original, revisedVersion);
  assert.notEqual(original, newDocument);
});

test('rejeita versão ou identificador de documento inválidos no envio', async () => {
  await assert.rejects(() => createLeaseIdempotencyKey('contract-send', lease, { version: 'v3' }), TypeError);
  await assert.rejects(() => createLeaseIdempotencyKey('contract-send', lease, { version: 3, documentId: '../outside' }), TypeError);
});


test('reutiliza a chave da mesma assinatura na mesma versão', async () => {
  const options = { version: 3, documentId: 'contract-uuid-42', party: 'landlord', signerName: 'Maria da Silva' };
  const first = await createLeaseIdempotencyKey('contract-sign', lease, options);
  const retry = await createLeaseIdempotencyKey('contract-sign', lease, { ...options });
  assert.equal(first, retry);
  assert.match(first, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/);
});

test('isola assinatura por parte, versão, documento e signatário', async () => {
  const original = await createLeaseIdempotencyKey('contract-sign', lease, {
    version: 3, documentId: 'contract-uuid-42', party: 'landlord', signerName: 'Maria da Silva',
  });
  const tenant = await createLeaseIdempotencyKey('contract-sign', lease, {
    version: 3, documentId: 'contract-uuid-42', party: 'tenant', signerName: 'João da Silva',
  });
  const nextVersion = await createLeaseIdempotencyKey('contract-sign', lease, {
    version: 4, documentId: 'contract-uuid-42', party: 'landlord', signerName: 'Maria da Silva',
  });
  const renamedSigner = await createLeaseIdempotencyKey('contract-sign', lease, {
    version: 3, documentId: 'contract-uuid-42', party: 'landlord', signerName: 'Maria Souza',
  });
  assert.equal(new Set([original, tenant, nextVersion, renamedSigner]).size, 4);
});

test('rejeita parte ou nome inválido antes da assinatura', async () => {
  await assert.rejects(() => createLeaseIdempotencyKey('contract-sign', lease, {
    version: 3, party: 'guarantor', signerName: 'Maria da Silva',
  }), TypeError);
  await assert.rejects(() => createLeaseIdempotencyKey('contract-sign', lease, {
    version: 3, party: 'tenant', signerName: '   ',
  }), TypeError);
  await assert.rejects(() => createLeaseIdempotencyKey('contract-sign', lease, {
    version: 3, party: 'tenant', signerName: 'a'.repeat(191),
  }), TypeError);
});
