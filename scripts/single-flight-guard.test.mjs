import assert from 'node:assert/strict';
import test from 'node:test';
import { createSingleFlightGuard } from '../src/services/singleFlightGuard.js';

test('ignora uma segunda ação enquanto a primeira continua pendente', async () => {
  const run = createSingleFlightGuard();
  let finishFirst;
  let secondStarted = false;

  const first = run(() => new Promise((resolve) => { finishFirst = resolve; }));
  const second = await run(async () => { secondStarted = true; });

  assert.deepEqual(second, { started: false, value: null });
  assert.equal(secondStarted, false);
  finishFirst('resultado original');
  assert.deepEqual(await first, { started: true, value: 'resultado original' });
});

test('libera a próxima ação depois de uma conclusão bem-sucedida', async () => {
  const run = createSingleFlightGuard();

  assert.deepEqual(await run(async () => 42), { started: true, value: 42 });
  assert.deepEqual(await run(async () => 84), { started: true, value: 84 });
});

test('libera a próxima ação depois de uma falha', async () => {
  const run = createSingleFlightGuard();
  const failure = new Error('falha simulada');

  await assert.rejects(run(async () => { throw failure; }), (error) => error === failure);
  assert.deepEqual(await run(async () => 'recuperado'), { started: true, value: 'recuperado' });
});
