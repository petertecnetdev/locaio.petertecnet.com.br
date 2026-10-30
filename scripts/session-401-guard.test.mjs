import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentAuthSession, shouldInvalidateSessionForUnauthorized } from '../src/services/session401Guard.js';

const current = { token: 'token-B', role: 'landlord', epoch: 2 };
const unauthorized = (snapshot, url = '/v1/apps/locaio/properties', status = 401) => ({
  response: { status },
  config: { url, __locaioAuthSnapshot: snapshot },
});

test('401 da sessão atual encerra somente a sessão correspondente', () => {
  assert.equal(shouldInvalidateSessionForUnauthorized(unauthorized(current), current), true);
});

test('401 tardio de sessão A não encerra sessão B', () => {
  assert.equal(shouldInvalidateSessionForUnauthorized(unauthorized({ ...current, token: 'token-A', epoch: 1 }), current), false);
});

test('401 tardio da mesma credencial não encerra sessão reaberta', () => {
  assert.equal(shouldInvalidateSessionForUnauthorized(unauthorized({ ...current, epoch: 1 }), current), false);
});

test('401 tardio do contexto de locatário não encerra contexto de locador', () => {
  assert.equal(shouldInvalidateSessionForUnauthorized(unauthorized({ ...current, role: 'tenant' }), current), false);
});

test('401 sem sessão ou sem snapshot não provoca logout', () => {
  assert.equal(shouldInvalidateSessionForUnauthorized(unauthorized(current), { ...current, token: null }), false);
  assert.equal(shouldInvalidateSessionForUnauthorized(unauthorized(null), current), false);
});

test('401 de login/cadastro não invalida sessão ativa', () => {
  for (const url of ['/auth/login', '/auth/register', '/auth/google', '/auth/email-verify']) {
    assert.equal(shouldInvalidateSessionForUnauthorized(unauthorized(current, url), current), false);
  }
});

test('403 e respostas de erro sem request não invalidam a sessão', () => {
  assert.equal(shouldInvalidateSessionForUnauthorized(unauthorized(current, undefined, 403), current), false);
  assert.equal(shouldInvalidateSessionForUnauthorized({ response: { status: 401 } }, current), false);
});

test('respostas de leitura da sessão A não devem sobrescrever dados de B', () => {
  assert.equal(isCurrentAuthSession({ ...current, token: 'token-A' }, current), false);
  assert.equal(isCurrentAuthSession({ ...current, epoch: 1 }, current), false);
  assert.equal(isCurrentAuthSession({ ...current, role: 'tenant' }, current), false);
  assert.equal(isCurrentAuthSession(current, current), true);
});

test('revogação tardia de logout nunca encerra novo login', () => {
  const logout401 = unauthorized({ ...current, token: 'token-A', epoch: 1 });
  logout401.config.url = '/auth/logout';
  logout401.config.__locaioSkipAuthInvalidation = true;
  assert.equal(shouldInvalidateSessionForUnauthorized(logout401, current), false);
});

test('respostas sem credenciais não são atribuídas à sessão atual', () => {
  assert.equal(isCurrentAuthSession({ token: null, role: 'landlord', epoch: 2 }, current), false);
  assert.equal(isCurrentAuthSession(current, { token: null, role: 'landlord', epoch: 2 }), false);
});
