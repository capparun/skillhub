#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolveOpencliInvocation, spawnInvocation, satisfiesOpencliVersion } from './process-distribution.mjs';
import {
  findDanglingPluginRegistrations,
  MINIMUM_NODE_VERSION,
  resolveInstallTargets,
  supportsNodeVersion,
} from './target-distribution.mjs';

const argv = process.argv.slice(2);
const jsonOutput = argv.includes('--json');
const distributionRoot = path.dirname(fileURLToPath(import.meta.url));
const receipt = JSON.parse(fs.readFileSync(path.join(distributionRoot, 'distribution.json'), 'utf8'));
const runtimeRoot = path.join(distributionRoot, 'runtime');
const targets = resolveInstallTargets(argv);
const skillsRoots = targets.skillRoots;
let failures = 0;
const checks = [];

check(`Node.js ${MINIMUM_NODE_VERSION}+`, supportsNodeVersion(process.version), process.version);

const needsOpencli = Boolean(receipt.requirements?.opencli)
  || (receipt.requirements?.plugins ?? []).length > 0
  || argv.includes('--linkedin-whoami') || argv.includes('--linkedin-runtime');
const isolatedRuntime = fs.existsSync(path.join(runtimeRoot, 'opencli.mjs'));
const opencli = needsOpencli ? resolveOpencliInvocation(runtimeRoot) : null;
if (needsOpencli) {
  const versionResult = spawn(opencli, ['--version']);
  const versionText = `${versionResult.stdout || ''}${versionResult.stderr || ''}`.trim();
  check(
    `OpenCLI ${receipt.requirements?.opencli ?? ''}`.trim(),
    versionResult.status === 0 && satisfiesOpencliVersion(versionText, receipt.requirements?.opencli),
    versionText || '未找到',
  );
}

const pluginResult = !isolatedRuntime && (receipt.requirements?.plugins ?? []).length > 0
  ? spawn(opencli, ['plugin', 'list']) : { status: 0, stdout: '', stderr: '' };
const pluginText = `${pluginResult.stdout || ''}${pluginResult.stderr || ''}`;
const danglingPlugins = new Map(
  (isolatedRuntime ? [] : findDanglingPluginRegistrations()).map(problem => [problem.name, problem.reason]),
);
for (const { name } of receipt.requirements?.plugins ?? []) {
  const probe = isolatedRuntime ? spawn(opencli, [name, '--help', '-f', 'json']) : pluginResult;
  const listed = probe.status === 0 && (isolatedRuntime ? probe.stdout : pluginText).includes(name);
  check(`插件 ${name}`, listed, listed ? (isolatedRuntime ? '包内命令可加载' : '已注册') : '未安装');
  if (!listed) continue;
  // 可达性自检:注册记录还在但软链目标被清理时,命令会以难懂的方式失败。
  const bundled = receipt.runtime?.packages?.find(item => item.name === name);
  const pluginDir = isolatedRuntime && bundled ? path.join(runtimeRoot, bundled.path)
    : path.join(os.homedir(), '.opencli', 'plugins', name);
  let reachable = false;
  let realDir = '';
  try {
    realDir = fs.realpathSync(pluginDir);
    reachable = fs.statSync(realDir).isDirectory();
  } catch {
    reachable = false;
  }
  const danglingReason = danglingPlugins.get(name);
  check(
    `插件 ${name} 目标可达`,
    reachable && !danglingReason,
    danglingReason ?? (reachable ? realDir : '注册软链悬空'),
  );
  if (reachable) {
    let packageJson;
    try {
      packageJson = JSON.parse(fs.readFileSync(path.join(realDir, 'package.json'), 'utf8'));
    } catch {
      check(`插件 ${name} 元数据`, false, 'package.json 缺失或无法解析');
      continue;
    }
    if (packageJson.dependencies?.['@hunter/core']) {
      // 仅对明确依赖 core 的插件检查；独立 Gllue 已内置评分模块。
      const coreResult = spawn(
        { command: process.execPath, prefixArgs: [] },
        ['--input-type=module', '--eval', "import('@hunter/core').then(() => process.exit(0), () => process.exit(1))"],
        { cwd: realDir },
      );
      check(`插件 ${name} 依赖可解析`, coreResult.status === 0, coreResult.status === 0 ? '@hunter/core' : '@hunter/core 解析失败');
    }
  }
}

for (const { id } of receipt.skills ?? []) {
  const hits = skillsRoots.filter(root => fs.existsSync(path.join(root, id)));
  check(`Skill ${id}`, hits.length > 0, hits.length > 0 ? hits.join('、') : '未安装');
}

if (argv.includes('--linkedin-whoami')) {
  const identityResult = spawn(opencli, ['linkedin', 'whoami', '-f', 'json']);
  const identityText = `${identityResult.stdout || ''}${identityResult.stderr || ''}`.trim();
  check('LinkedIn 登录态', identityResult.status === 0, identityText || '未登录');
}

if (argv.includes('--linkedin-runtime')) {
  const daemonResult = spawn(opencli, ['daemon', 'status']);
  const daemonText = `${daemonResult.stdout || ''}${daemonResult.stderr || ''}`.trim();
  check('OpenCLI daemon 状态', daemonResult.status === 0 && /running/i.test(daemonText), daemonText || '未运行');

  const daemonPort = Number(process.env.HUNTER_DAEMON_PORT || 19825);
  const daemonReachable = Number.isInteger(daemonPort)
    && daemonPort > 0
    && daemonPort <= 65535
    && await probeTcpPort('127.0.0.1', daemonPort);
  check(
    'OpenCLI daemon 端口可达',
    daemonReachable,
    daemonReachable ? `127.0.0.1:${daemonPort}` : `127.0.0.1:${daemonPort} 未监听；请运行 opencli daemon restart`,
  );
}

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    ok: failures === 0,
    platform: process.platform,
    agent: { requested: targets.requestedAgent, detected: targets.detectedAgent },
    targets: { skills: skillsRoots, state: targets.stateRoot },
    checks,
  }, null, 2)}\n`);
} else if (failures > 0) {
  console.error(`\nHunter doctor: ${failures} 项未通过。`);
} else {
  console.log('\nHunter doctor: 全部通过。');
}

if (!jsonOutput && failures === 0) await checkForUpdates();
process.exit(failures > 0 ? 1 : 0);

// 24 小时静默版本检查:与猎策分发站比对公开版本元数据。
// 任何网络/服务异常都静默跳过,绝不打扰正常诊断结果。
async function checkForUpdates() {
  try {
    const home = targets.stateRoot;
    const cacheFile = path.join(home, 'last-update-check.json');
    let cache = {};
    try {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch { /* 无缓存 */ }
    if (cache.checkedAt && Date.now() - new Date(cache.checkedAt).getTime() < 24 * 3600 * 1000) {
      return;
    }

    const installDir = path.join(home, 'installations');
    let records = [];
    try {
      records = fs
        .readdirSync(installDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => JSON.parse(fs.readFileSync(path.join(installDir, name), 'utf8')));
    } catch {
      return; // 未做过在线登记安装
    }
    if (records.length === 0) return;

    // 先记录检查时间,网络失败也不反复请求
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ checkedAt: new Date().toISOString() }));

    for (const record of records) {
      if (!record.serverUrl || !record.product) continue;
      try {
        const response = await fetch(
          `${record.serverUrl}/api/releases/latest?product=${encodeURIComponent(record.product)}`,
          { signal: AbortSignal.timeout(3000) },
        );
        if (!response.ok) continue;
        const data = await response.json();
        if (data.version && record.version && semverGt(data.version, record.version)) {
          console.log(
            `\n提示: ${record.product} 有新版本 v${data.version}(当前 v${record.version})。更新请运行:`,
          );
          console.log(`  node ${path.join(home, 'packages', record.product, 'update.mjs')}`);
        }
      } catch { /* 网络失败静默 */ }
    }
  } catch { /* 静默 */ }
}

function semverGt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

function check(label, ok, detail = '') {
  checks.push({ label, ok, detail });
  if (!jsonOutput) console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}


function spawn(command, args, options) {
  return spawnInvocation(command, args, options);
}

function probeTcpPort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
