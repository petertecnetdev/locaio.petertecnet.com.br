import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSmokeCorsHeaders, buildSmokePreflightResponse } from './smoke-cors.mjs';

test('responde a origem exata da aplicação sem caminho ou credenciais', () => {
  const headers = buildSmokeCorsHeaders('https://locaio.petertecnet.com.br/dashboard?from=smoke');
  assert.equal(headers['access-control-allow-origin'], 'https://locaio.petertecnet.com.br');
  assert.equal(headers.vary, 'Origin');
});

test('autoriza os métodos usados pelo fluxo de locação', () => {
  const methods = buildSmokeCorsHeaders('https://locaio.petertecnet.com.br')['access-control-allow-methods'];
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']) {
    assert.ok(methods.split(',').map((item) => item.trim()).includes(method), `Método não autorizado: ${method}`);
  }
});

test('autoriza os cabeçalhos de autenticação e contexto enviados pelo frontend', () => {
  const allowed = buildSmokeCorsHeaders('https://locaio.petertecnet.com.br')['access-control-allow-headers'].toLowerCase();
  for (const header of ['authorization', 'content-type', 'x-peter-app', 'x-frontend-page', 'x-peter-context-role', 'x-peter-ecosystem-sdk']) {
    assert.ok(allowed.split(',').map((item) => item.trim()).includes(header), `Cabeçalho não autorizado: ${header}`);
  }
});

test('preflight retorna 204 sem corpo e com todos os cabeçalhos CORS', () => {
  const response = buildSmokePreflightResponse('https://locaio.petertecnet.com.br');
  assert.equal(response.status, 204);
  assert.equal(response.body, '');
  assert.equal(response.headers['access-control-allow-origin'], 'https://locaio.petertecnet.com.br');
  assert.ok(response.headers['access-control-allow-methods']);
  assert.ok(response.headers['access-control-allow-headers']);
  assert.equal(response.headers['access-control-max-age'], '600');
});

test('rejeita origens inválidas e esquemas não HTTP', () => {
  assert.throws(() => buildSmokeCorsHeaders('not-a-url'), TypeError);
  assert.throws(() => buildSmokeCorsHeaders('javascript:alert(1)'), TypeError);
  assert.throws(() => buildSmokePreflightResponse('file:///tmp/test'), TypeError);
});
