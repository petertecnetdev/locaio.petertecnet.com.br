import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedDocumentDownloadUrl } from '../src/services/documentDownloadGuard.js';

const base = 'https://api.petertecnet.com.br/api';
const origin = 'https://locaio.petertecnet.com.br';
const valid = 'https://api.petertecnet.com.br/api/v1/apps/locaio/leases/123/documents/456/download';
const allows = (href) => isTrustedDocumentDownloadUrl(href, base, 'locaio', origin);

test('aceita somente documento na origem e prefixo da API', () => {
  assert.equal(allows(valid), true);
});

test('rejeita host externo que imita caminho de documento', () => {
  assert.equal(allows(valid.replace('api.petertecnet.com.br', 'evil.example')), false);
});

test('rejeita host com sufixo parecido e esquema não HTTP', () => {
  assert.equal(allows(valid.replace('api.petertecnet.com.br', 'api.petertecnet.com.br.evil.example')), false);
  assert.equal(allows('javascript:alert(1)'), false);
});

test('rejeita rota sem prefixo API e documento de outro aplicativo', () => {
  assert.equal(allows(valid.replace('/api/v1/', '/v1/')), false);
  assert.equal(allows(valid.replace('/apps/locaio/', '/apps/cutinapp/')), false);
});

test('rejeita caminho de documento fora de leases e URL inválida', () => {
  assert.equal(allows('https://api.petertecnet.com.br/api/v1/apps/locaio/documents/456'), false);
  assert.equal(allows('http://[invalid'), false);
});
