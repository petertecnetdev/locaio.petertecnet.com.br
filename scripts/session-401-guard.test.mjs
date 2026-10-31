import assert from 'node:assert/strict';
import test from 'node:test';
import { isAuthSessionStorageEvent, isCurrentAuthSession, resolveRequestAuthSession, shouldApplyLatestSessionResponse, shouldInvalidateSessionForUnauthorized } from '../src/services/session401Guard.js';

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


test('aplica somente a resposta mais recente da sessão que iniciou a leitura', () => {
  assert.equal(shouldApplyLatestSessionResponse(3, 3, current, current), true);
  assert.equal(shouldApplyLatestSessionResponse(2, 3, current, current), false);
});

test('descarta respostas após troca de conta, contexto ou geração da sessão', () => {
  assert.equal(shouldApplyLatestSessionResponse(3, 3, { ...current, token: 'token-A' }, current), false);
  assert.equal(shouldApplyLatestSessionResponse(3, 3, { ...current, role: 'tenant' }, current), false);
  assert.equal(shouldApplyLatestSessionResponse(3, 3, { ...current, epoch: 1 }, current), false);
});

test('rejeita identificadores de leitura inválidos ou sem sessão', () => {
  assert.equal(shouldApplyLatestSessionResponse(0, 0, current, current), false);
  assert.equal(shouldApplyLatestSessionResponse(Number.NaN, 3, current, current), false);
  assert.equal(shouldApplyLatestSessionResponse(3, 3, { ...current, token: null }, current), false);
  assert.equal(shouldApplyLatestSessionResponse(3, 3, current, { ...current, token: null }), false);
});


test('mantém o snapshot esperado quando a sessão não mudou', () => {
  assert.deepEqual(resolveRequestAuthSession(current, current), current);
});

test('bloqueia o envio quando o token muda antes do interceptor', () => {
  assert.equal(resolveRequestAuthSession({ ...current, token: 'token-A' }, current), null);
});

test('bloqueia o envio quando a geração muda mesmo com token igual', () => {
  assert.equal(resolveRequestAuthSession(current, { ...current, epoch: current.epoch + 1 }), null);
});

test('bloqueia o envio quando o contexto muda', () => {
  assert.equal(resolveRequestAuthSession(current, { ...current, role: 'tenant' }), null);
});

test('usa a sessão atual para chamadas sem snapshot explícito', () => {
  assert.deepEqual(resolveRequestAuthSession(undefined, current), current);
});

test('preserva chamadas públicas quando ambas as sessões estão anônimas e iguais', () => {
  const anonymous = { token: null, role: null, epoch: 0 };
  assert.deepEqual(resolveRequestAuthSession(anonymous, anonymous), anonymous);
});

test('bloqueia chamada pública antiga quando uma sessão autenticada começa', () => {
  const anonymous = { token: null, role: null, epoch: 0 };
  assert.equal(resolveRequestAuthSession(anonymous, current), null);
});


const authStorageKeys = ['token', 'access_token', 'auth_token'];
const contextStorageKey = 'peter_context_role:locaio';

test('sincroniza alterações do token principal e aliases entre abas', () => {
  for (const key of authStorageKeys) {
    assert.equal(isAuthSessionStorageEvent({ key }, authStorageKeys, contextStorageKey), true);
  }
});

test('sincroniza alterações de contexto entre abas', () => {
  assert.equal(isAuthSessionStorageEvent({ key: contextStorageKey }, authStorageKeys, contextStorageKey), true);
});

test('trata localStorage.clear como alteração de sessão', () => {
  assert.equal(isAuthSessionStorageEvent({ key: null }, authStorageKeys, contextStorageKey), true);
});

test('ignora alterações de perfil que não mudam a identidade da sessão', () => {
  assert.equal(isAuthSessionStorageEvent({ key: 'user' }, authStorageKeys, contextStorageKey), false);
});

test('ignora chaves sem relação com autenticação ou contexto', () => {
  assert.equal(isAuthSessionStorageEvent({ key: 'theme' }, authStorageKeys, contextStorageKey), false);
  assert.equal(isAuthSessionStorageEvent({ key: 'cart' }, authStorageKeys, contextStorageKey), false);
});

test('ignora eventos de armazenamento inválidos', () => {
  assert.equal(isAuthSessionStorageEvent(null, authStorageKeys, contextStorageKey), false);
  assert.equal(isAuthSessionStorageEvent({}, authStorageKeys, contextStorageKey), false);
  assert.equal(isAuthSessionStorageEvent({ key: undefined }, authStorageKeys, contextStorageKey), false);
});


test('ignora eventos de sessionStorage ao sincronizar a sessão da aplicação', () => {
  const localStorageArea = {};
  const sessionStorageArea = {};
  assert.equal(isAuthSessionStorageEvent({ key: 'access_token', storageArea: localStorageArea }, authStorageKeys, contextStorageKey, localStorageArea), true);
  assert.equal(isAuthSessionStorageEvent({ key: 'access_token', storageArea: sessionStorageArea }, authStorageKeys, contextStorageKey, localStorageArea), false);
});
