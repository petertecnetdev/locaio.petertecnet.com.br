import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
const match = source.match(/export function appMutationPolicy\(role, method, path\) \{[\s\S]*?\n\}\n\nfunction readKey/);

if (!match) {
  throw new Error('appMutationPolicy não encontrada em src/services/api.js.');
}

const functionSource = match[0]
  .replace(/^export /, '')
  .replace(/\n\nfunction readKey$/, '');
const appMutationPolicy = new Function(`${functionSource}; return appMutationPolicy;`)();

const cases = [
  ['landlord', 'post', '/leases/1/charges/2/payment', false, 'proprietário não pode iniciar checkout'],
  ['landlord', 'post', '/leases/99/charges/100/payment?retry=1', false, 'query string não pode contornar o guard'],
  ['landlord', 'patch', '/leases/1/charges/2/paid', true, 'proprietário pode confirmar recebimento'],
  ['landlord', 'post', '/leases/1/charges/schedule', true, 'proprietário pode gerar cronograma'],
  ['tenant', 'post', '/leases/1/charges/2/payment', true, 'inquilino pode iniciar pagamento'],
  ['tenant', 'post', '/leases/1/charges/schedule', false, 'inquilino não pode gerar cronograma financeiro'],
  ['tenant', 'patch', '/leases/1/charges/2/paid', false, 'inquilino não pode marcar cobrança como recebida'],
  [null, 'post', '/leases/1/charges/2/payment', true, 'API continua como autoridade quando não há contexto local'],
];

for (const [role, method, path, expected, description] of cases) {
  const result = appMutationPolicy(role, method, path);
  if (result.allowed !== expected) {
    throw new Error(`${description}: esperado allowed=${expected}, recebido ${JSON.stringify(result)}.`);
  }
  if (!expected && (!result.code || !result.message)) {
    throw new Error(`${description}: bloqueio precisa expor código e mensagem legíveis.`);
  }
}

console.log(`Context policy guard OK: ${cases.length} cenários de proprietário/inquilino validados.`);
