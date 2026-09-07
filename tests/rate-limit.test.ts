import { test } from 'node:test';
import assert from 'node:assert/strict';
import { take } from '../src/lib/server/rate-limit';

test('窗口内超过限额被拒绝', () => {
  const key = `k-${Math.random()}`;
  assert.equal(take(key, 3, 60), true);
  assert.equal(take(key, 3, 60), true);
  assert.equal(take(key, 3, 60), true);
  assert.equal(take(key, 3, 60), false);
});

test('不同 key 互不影响', () => {
  const a = `a-${Math.random()}`;
  const b = `b-${Math.random()}`;
  take(a, 1, 60);
  assert.equal(take(a, 1, 60), false);
  assert.equal(take(b, 1, 60), true);
});

test('窗口过期后重新计数', async () => {
  const key = `w-${Math.random()}`;
  assert.equal(take(key, 1, 1), true);
  assert.equal(take(key, 1, 1), false);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(take(key, 1, 1), true);
});
