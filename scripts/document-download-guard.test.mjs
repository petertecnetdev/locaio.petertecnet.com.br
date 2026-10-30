import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedDocumentDownloadUrl, safeDocumentFilename } from '../src/services/documentDownloadGuard.js';

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

test('preserva nomes UTF-8 enviados por Content-Disposition', () => {
  assert.equal(safeDocumentFilename("attachment; filename*=UTF-8''contrato%20de%20loca%C3%A7%C3%A3o.pdf"), 'contrato de locação.pdf');
  assert.equal(safeDocumentFilename('attachment; filename="recibo.pdf"'), 'recibo.pdf');
});

test('remove diretórios e caracteres perigosos do nome recebido', () => {
  assert.equal(safeDocumentFilename('attachment; filename="../../contrato.pdf"'), 'contrato.pdf');
  assert.equal(safeDocumentFilename("attachment; filename*=UTF-8''..%2F..%2Fsegredo%0A.pdf"), 'segredo_.pdf');
  assert.equal(safeDocumentFilename('attachment; filename="C:\\temp\\recibo.pdf"'), 'recibo.pdf');
});

test('nome inválido, reservado ou codificação incorreta não interrompe download', () => {
  assert.equal(safeDocumentFilename(''), 'documento');
  assert.equal(safeDocumentFilename('attachment; filename=".."'), 'documento');
  assert.equal(safeDocumentFilename('attachment; filename="CON.txt"'), 'documento-CON.txt');
  assert.equal(safeDocumentFilename("attachment; filename*=UTF-8''fatura%ZZ.pdf"), 'fatura%ZZ.pdf');
});
