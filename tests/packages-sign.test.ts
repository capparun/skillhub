import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PACKAGE_URL_SECRET = 'test-secret';
process.env.PUBLIC_APP_URL = 'https://skills.example.com';
process.env.PACKAGE_STORAGE_DIR = '/tmp/liec-test-packages';

import { signDownloadUrl, verifyDownloadUrl, buildPackageKey } from '../src/lib/server/packages';
import { HttpError } from '../src/lib/server/http';

const KEY = buildPackageKey('hunter-align', '1.0.0', 'hunter-align-1.0.0.tar.gz');

function parseUrl(url: string) {
  const u = new URL(url);
  return { e: u.searchParams.get('e'), s: u.searchParams.get('s'), path: u.pathname };
}

test('签名的下载地址可以验证通过', () => {
  const url = signDownloadUrl(KEY, 300);
  assert.ok(url.startsWith('https://skills.example.com/api/download/'));
  const { e, s, path } = parseUrl(url);
  assert.ok(path.endsWith(`/api/download/${KEY}`));
  assert.doesNotThrow(() => verifyDownloadUrl(KEY, e, s));
});

test('过期地址被拒绝', () => {
  const url = signDownloadUrl(KEY, -10);
  const { e, s } = parseUrl(url);
  assert.throws(() => verifyDownloadUrl(KEY, e, s), (err: unknown) => {
    return err instanceof HttpError && err.code === 'url_expired';
  });
});

test('篡改签名或 key 被拒绝', () => {
  const { e, s } = parseUrl(signDownloadUrl(KEY, 300));
  assert.throws(() => verifyDownloadUrl(KEY, e, 'f'.repeat(32)), HttpError);
  const otherKey = buildPackageKey('hunter-align', '9.9.9', 'x.tar.gz');
  assert.throws(() => verifyDownloadUrl(otherKey, e, s), HttpError);
});

test('缺参数被拒绝', () => {
  assert.throws(() => verifyDownloadUrl(KEY, null, null), HttpError);
});

test('非法 key 直接拒绝', () => {
  assert.throws(() => buildPackageKey('a', '1.0', 'x.tar.gz'), HttpError);
  assert.throws(() => buildPackageKey('a/../b', '1.0.0', 'x.tar.gz'), HttpError);
  assert.throws(() => buildPackageKey('a', '1.0.0', 'x.zip'), HttpError);
});
