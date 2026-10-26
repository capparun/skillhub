#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pointerPath = path.join(skillRoot, '.hunter-installation.json');

if (!fs.existsSync(pointerPath)) {
  console.error('未找到猎策安装路径登记。请使用最新安装包重新安装一次，再重试更新。');
  process.exit(1);
}

let pointer;
try {
  pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
} catch {
  console.error('猎策安装路径登记损坏。请使用最新安装包重新安装一次，再重试更新。');
  process.exit(1);
}

const product = pointer?.product;
const stateRoot = pointer?.stateRoot;
if (typeof product !== 'string' || !product || typeof stateRoot !== 'string' || !path.isAbsolute(stateRoot)) {
  console.error('猎策安装路径登记无效。请使用最新安装包重新安装一次，再重试更新。');
  process.exit(1);
}

const receiptPath = path.join(stateRoot, 'installations', `${product}.json`);
const updaterPath = path.join(stateRoot, 'packages', product, 'update.mjs');
if (!fs.existsSync(receiptPath) || !fs.existsSync(updaterPath)) {
  console.error('猎策安装记录或更新器缺失。请使用最新安装包重新安装一次，再重试更新。');
  process.exit(1);
}

const result = spawnSync(process.execPath, [updaterPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
if (result.error) {
  console.error(`无法启动猎策更新器：${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
