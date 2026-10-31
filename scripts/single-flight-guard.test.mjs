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


test('impede uploads duplicados sem bloquear ações independentes do contrato', async () => {
  const uploadGuard = createSingleFlightGuard();
  const actionGuard = createSingleFlightGuard();
  let finishUpload;
  let uploadsStarted = 0;

  const firstUpload = uploadGuard(() => {
    uploadsStarted += 1;
    return new Promise((resolve) => { finishUpload = resolve; });
  });
  const duplicateUpload = await uploadGuard(async () => {
    uploadsStarted += 1;
    return 'duplicado';
  });
  const independentAction = await actionGuard(async () => 'ação financeira');

  assert.deepEqual(duplicateUpload, { started: false, value: null });
  assert.deepEqual(independentAction, { started: true, value: 'ação financeira' });
  assert.equal(uploadsStarted, 1);

  finishUpload('documento enviado');
  assert.deepEqual(await firstUpload, { started: true, value: 'documento enviado' });
});
