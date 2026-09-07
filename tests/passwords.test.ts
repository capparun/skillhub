import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/server/passwords';

test('scrypt 哈希可校验往返', () => {
  const stored = hashPassword('my-secret-password');
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(verifyPassword('my-secret-password', stored), true);
});

test('错误密码不通过', () => {
  const stored = hashPassword('my-secret-password');
  assert.equal(verifyPassword('wrong-password', stored), false);
});

test('相同密码两次哈希结果不同(随机盐)', () => {
  assert.notEqual(hashPassword('same'), hashPassword('same'));
});

test('格式非法的存储串不通过而不是抛错', () => {
  assert.equal(verifyPassword('x', 'not-a-hash'), false);
  assert.equal(verifyPassword('x', 'scrypt$bad'), false);
  assert.equal(verifyPassword('x', ''), false);
});
