import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY as P, evaluate, isLooser } from '../src/policy.js';
const ctx = { balance: 100, spentToday: 0 };
const loose = { ...P, maxTx: 999, daily: 999 };

test('yield within limits is approved', () =>
  assert.equal(evaluate(P, ctx, { type: 'yield', pct: 15, protocol: 'Meta Pool' }).verdict, 'approved'));
test('allocation above max is rejected', () =>
  assert.equal(evaluate(P, ctx, { type: 'yield', pct: 45, protocol: 'Meta Pool' }).verdict, 'rejected'));
test('unapproved protocol is rejected', () =>
  assert.equal(evaluate(P, ctx, { type: 'yield', pct: 10, protocol: 'Burrow' }).verdict, 'rejected'));
test('reserve floor is enforced', () =>
  assert.equal(evaluate(loose, ctx, { type: 'transfer', amount: 90 }).verdict, 'rejected'));
test('large transfer needs approval', () =>
  assert.equal(evaluate(loose, { balance: 500, spentToday: 0 }, { type: 'transfer', amount: 60 }).verdict, 'approval'));
test('daily limit counts earlier spending', () =>
  assert.equal(evaluate(P, { balance: 500, spentToday: 190 }, { type: 'transfer', amount: 20 }).verdict, 'rejected'));
test('restricted type is rejected', () =>
  assert.equal(evaluate({ ...P, types: ['transfer'] }, ctx, { type: 'yield', pct: 10, protocol: 'Meta Pool' }).verdict, 'rejected'));
test('bad amounts are rejected', () => {
  assert.equal(evaluate(P, ctx, { type: 'transfer', amount: -5 }).verdict, 'rejected');
  assert.equal(evaluate(P, ctx, { type: 'transfer', amount: NaN }).verdict, 'rejected');
  assert.equal(evaluate(P, { balance: 0, spentToday: 0 }, { type: 'transfer', amount: 1 }).verdict, 'rejected');
});
test('looser direction is detected per field', () => {
  assert.equal(isLooser('maxAlloc', 30, 40), true);
  assert.equal(isLooser('minReserve', 20, 10), true);
  assert.equal(isLooser('minReserve', 20, 30), false);
  assert.equal(isLooser('approveAbove', 50, 80), true);
  assert.equal(isLooser('protocols', ['a'], ['a', 'b']), true);
});
