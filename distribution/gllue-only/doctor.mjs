#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolveOpencliInvocation, spawnInvocation } from './process-distribution.mjs';
import { findDanglingPluginRegistrations, resolveInstallTargets } from './target-distribution.mjs';

const argv = process.argv.slice(2);
const jsonOutput = argv.includes('--json');
const distributionRoot = path.dirname(fileURLToPath(import.meta.url));
const receipt = JSON.parse(fs.readFileSync(path.join(distributionRoot, 'distribution.json'), 'utf8'));
const runtimeRoot = path.join(distributionRoot, 'runtime');
const opencli = resolveOpencliInvocation(runtimeRoot);
const targets = resolveInstallTargets(argv);
const skillsRoots = targets.skillRoots;
let failures = 0;
let unverified = 0;
const checks = [];

check('Node.js 22+', Number(process.versions.node.split('.')[0]) >= 22, process.version);

const versionResult = spawn(opencli, ['--version']);
const versionText = `${versionResult.stdout || ''}${versionResult.stderr || ''}`.trim();
checkProcess(versionResult,
  `OpenCLI ${receipt.requirements?.opencli ?? ''}`.trim(),
  versionResult.status === 0 && satisfiesMinimum(versionText, receipt.requirements?.opencli),
  versionText || '未找到',
);

for (const {name} of receipt.requirements?.plugins ?? []) {
  const result=spawn(opencli,[name,'--help']);
  const output=`${result.stdout||''}${result.stderr||''}`;
  const loaded=result.status===0 && ['login','test-connection','session-watch','capability-probe','search-candidates','get-candidate','evaluate','compare-candidate','add-note','update-candidate','check-exists','search-jobs','get-job','add-candidate','associate-job'].every(command=>output.includes(command));
  checkProcess(result,`插件 ${name}`,loaded,loaded?'独立运行时命令加载通过；真实网站待验收':`${result.stdout||''}${result.stderr||''}`);
}

for (const { id } of receipt.skills ?? []) {
  const hits = skillsRoots.filter(root => fs.existsSync(path.join(root, id)));
  check(`Skill ${id}`, hits.length > 0, hits.length > 0 ? hits.join('、') : '未安装');
}


if (jsonOutput) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    ok: failures === 0 && unverified === 0,
    status: failures ? 'failed' : unverified ? 'unverified' : 'passed',
    platform: process.platform,
    agent: { requested: targets.requestedAgent, detected: targets.detectedAgent },
    targets: { skills: skillsRoots, state: targets.stateRoot },
    checks,
  }, null, 2)}\n`);
} else if (unverified > 0) {
  console.error(`\nHunter doctor: ${unverified} 项检查无法执行，${failures} 项未通过。请在普通终端复验，不能据此判定已安装或未安装。`);
} else if (failures > 0) {
  console.error(`\nHunter doctor: ${failures} 项未通过。`);
} else {
  console.log('\nHunter doctor: 全部通过。');
}

if (!jsonOutput && failures === 0 && unverified === 0) await checkForUpdates();
process.exit(failures > 0 ? 1 : unverified > 0 ? 2 : 0);

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
  checks.push({ label, ok, status: ok ? 'passed' : 'failed', detail });
  if (!jsonOutput) console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function checkProcess(result, label, ok, detail) {
  if (result.error || result.status === null) {
    const reason = result.error?.code ?? result.signal ?? 'NO_EXIT_STATUS';
    const message = `检查无法执行（${reason}），安装状态未验证。请在普通终端运行同一包的 doctor；不要据此重装。`;
    checks.push({ label, ok: false, status: 'unverified', detail: message });
    unverified += 1;
    if (!jsonOutput) console.error(`? ${label} — ${message}`);
    return;
  }
  check(label, ok, detail);
}

function satisfiesMinimum(versionText, requirement = '') {
  const actual = versionText.match(/\d+\.\d+\.\d+/)?.[0];
  const exact = requirement.trim().match(/^(?:=\s*)?(\d+\.\d+\.\d+)$/)?.[1];
  const minimum = requirement.match(/>=\s*(\d+\.\d+\.\d+)/)?.[1];
  if (!actual) return false;
  if (exact) return actual===exact;
  if (!minimum) return false;
  const actualParts = actual.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }
  return true;
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
