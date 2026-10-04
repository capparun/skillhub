import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseLabel } from '../src/lib/product-release';
test('发布、未发布、读取失败和加载中具有不同状态', () => {
  assert.equal(releaseLabel('ready', { version: '2.0.11' }), '已发布 · v2.0.11');
  assert.equal(releaseLabel('ready', null), '尚未发布');
  assert.equal(releaseLabel('error', null), '暂时无法获取版本');
  assert.equal(releaseLabel('loading', null), '正在获取版本');
});
test('读取失败不把旧版本或空发布记录显示为已发布', () => {
  assert.equal(releaseLabel('error', { version: '2.0.6' }), '暂时无法获取版本');
  assert.equal(releaseLabel('loading', { version: '2.0.6' }), '正在获取版本');
});
