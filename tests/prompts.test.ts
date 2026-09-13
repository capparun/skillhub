import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freeInstallPrompt,
  freeCliCommand,
  windowsCliCommand,
  windowsPaidCliCommand,
  paidInstallPrompt,
  paidCliCommand,
} from '../src/lib/prompts';

const freeInput = {
  appUrl: 'https://skills.example.com',
  productName: '职位需求对齐',
  productSlug: 'hunter-align',
  version: '1.0.0',
  sha256: 'a'.repeat(64),
};

const paidInput = {
  appUrl: 'https://skills.example.com',
  productName: 'SOHO 猎头人才寻访工作流',
  productSlug: 'soho-sourcing',
  token: 'hunter_it_testtoken123',
  tokenTtlMinutes: 10,
};

test('免费安装 Prompt 填入下载地址与哈希', () => {
  const prompt = freeInstallPrompt(freeInput);
  assert.ok(prompt.includes('https://skills.example.com/api/products/hunter-align/download'));
  assert.ok(prompt.includes('a'.repeat(64)));
  assert.ok(prompt.includes('--product hunter-align --version 1.0.0'));
  assert.ok(!prompt.includes('undefined'));
});

test('付费安装 Prompt 填入令牌与兑换地址,提示一次性与时效', () => {
  const prompt = paidInstallPrompt(paidInput);
  assert.ok(prompt.includes('hunter_it_testtoken123'));
  assert.ok(
    prompt.includes(
      'https://skills.example.com/api/install-tokens/hunter_it_testtoken123/redeem',
    ),
  );
  assert.ok(prompt.includes('10 分钟'));
  assert.ok(prompt.includes('--update-credential'));
  assert.ok(!prompt.includes('undefined'));
});

test('命令行命令指向 install.sh', () => {
  assert.equal(
    freeCliCommand(freeInput),
    'curl -fsSL https://skills.example.com/install.sh | bash -s -- hunter-align',
  );
  assert.equal(
    paidCliCommand(paidInput),
    'curl -fsSL https://skills.example.com/install.sh | bash -s -- soho-sourcing hunter_it_testtoken123',
  );
});

test('Windows 命令行命令指向 install.ps1 并传递参数', () => {
  assert.equal(
    windowsCliCommand(freeInput),
    "$script = irm https://skills.example.com/install.ps1; & ([scriptblock]::Create($script)) -Product 'hunter-align'",
  );
  assert.equal(
    windowsPaidCliCommand(paidInput),
    "$script = irm https://skills.example.com/install.ps1; & ([scriptblock]::Create($script)) -Product 'soho-sourcing' -Token 'hunter_it_testtoken123'",
  );
});
