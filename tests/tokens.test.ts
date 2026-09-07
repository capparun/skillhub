import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomToken, sha256hex } from '../src/lib/server/tokens';

test('令牌带前缀,哈希是 64 位 hex', () => {
  const { plain, hash } = randomToken('hunter_it');
  assert.ok(plain.startsWith('hunter_it_'));
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, sha256hex(plain));
});

test('两次生成的令牌不同', () => {
  assert.notEqual(randomToken('a').plain, randomToken('a').plain);
});

test('sha256hex 稳定', () => {
  assert.equal(
    sha256hex('hello'),
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  );
});
