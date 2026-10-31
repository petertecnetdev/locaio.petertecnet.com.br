import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldApplyPaymentProfileResult } from '../src/services/paymentProfileSessionGuard.js';

const landlordA = { token: 'token-A', role: 'landlord', epoch: 1 };
const landlordB = { token: 'token-B', role: 'landlord', epoch: 2 };

const canApply = (requestId, latestRequestId, started = landlordA, current = landlordA) =>
  shouldApplyPaymentProfileResult(requestId, latestRequestId, started, current);

test('aplica a resposta mais recente da sessão atual', () => {
  assert.equal(canApply(3, 3), true);
});

test('descarta resposta antiga quando uma recarga mais recente já começou', () => {
  assert.equal(canApply(2, 3), false);
});

test('descarta perfil da conta A depois que a sessão muda para B', () => {
  assert.equal(canApply(3, 3, landlordA, landlordB), false);
});

test('descarta resposta quando o contexto muda sem trocar o token', () => {
  const tenantA = { ...landlordA, role: 'tenant', epoch: 2 };
  assert.equal(canApply(3, 3, landlordA, tenantA), false);
});

test('descarta resposta depois de logout', () => {
  assert.equal(canApply(3, 3, landlordA, { ...landlordA, token: null, epoch: 2 }), false);
});

test('rejeita identificadores de sequência inválidos', () => {
  assert.equal(canApply(Number.NaN, 3), false);
  assert.equal(canApply(3, Number.POSITIVE_INFINITY), false);
  assert.equal(canApply(3, 4), false);
});
