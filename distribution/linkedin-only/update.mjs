#!/usr/bin/env node
import {findPackageRoot} from './package-root.mjs';
// Hunter 客户包更新:比对远端版本 → 授权 → 下载校验 → 备份 → 覆盖安装 → 诊断。
// 通常从固定位置运行: node ~/.hunter/packages/<product>/update.mjs
// 也可显式指定: node update.mjs --product <slug>
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInvocation, spawnInvocation } from './process-distribution.mjs';
import { getArg as getTargetArg, findDanglingPluginRegistrations, inferStateRootFromUpdater, resolveInstallTargets } from './target-distribution.mjs';

const argv = process.argv.slice(2);
const initialTargets = resolveInstallTargets(argv);
const scriptPath = fileURLToPath(import.meta.url);

function getArg(name) {
  const index = argv.indexOf(name);
  return index !== -1 ? argv[index + 1] : null;
}

// 目标商品:--product 指定;否则按脚本所在目录(~/.hunter/packages/<product>/)推断
let product = getArg('--product');
if (!product) {
  const here = path.dirname(scriptPath);
  if (path.basename(path.dirname(here)) === 'packages') {
    product = path.basename(here);
  }
}
if (!product) {
  console.error('用法: node update.mjs --product <商品标识>');
  process.exit(1);
}

const explicitStateRoot = getTargetArg(argv, '--state-dir') ?? process.env.HUNTER_STATE_DIR;
const stateRoot = explicitStateRoot
  ? path.resolve(explicitStateRoot)
  : inferStateRootFromUpdater(scriptPath, product) ?? initialTargets.stateRoot;
const recordPath = path.join(stateRoot, 'installations', `${product}.json`);
if (!fs.existsSync(recordPath)) {
  console.error(`未找到 ${product} 的安装记录(${recordPath}),请先完成安装。`);
  process.exit(1);
}
const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
const targets = resolveInstallTargets([
  '--agent', record.agent ?? initialTargets.requestedAgent,
  '--project-dir', record.projectDir ?? initialTargets.projectDir,
  ...(record.skillTargets?.[0] ? ['--skills-dir', record.skillTargets[0]] : []),
  '--state-dir', record.stateTarget ?? stateRoot,
]);
if (!record.serverUrl) {
  console.error('安装记录缺少分发站地址,无法检查更新。');
  process.exit(1);
}

// 1. 查询最新版本(15 秒超时 + 重试 1 次;5 秒在网络抖动/代理下频繁误杀,故障报告 8.3)
let latest = null;
let lastCheckError = null;
for (let attempt = 0; attempt < 2 && !latest; attempt += 1) {
  try {
    const response = await fetch(
      `${record.serverUrl}/api/releases/latest?product=${encodeURIComponent(product)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    latest = await response.json();
  } catch (error) {
    lastCheckError = error;
  }
}
if (!latest) {
  console.error(`无法检查更新(网络或服务不可用): ${lastCheckError.message}`);
  console.error('已安装版本不受影响,可稍后重试。');
  process.exit(1);
}

if (!semverGt(latest.version, record.version)) {
  console.log(`${product} 已是最新版本 v${record.version}。`);
  process.exit(0);
}
console.log(`发现新版本: v${latest.version}(当前 v${record.version})`);
if (argv.includes('--check')) {
  console.log('仅检查更新：未安装新版本。');
  process.exit(0);
}

// 2. 获取下载地址:付费商品走更新凭据授权,免费商品用公开地址
let downloadUrl = latest.downloadUrl;
let sha256 = latest.sha256;
if (record.updateCredential) {
  const authResponse = await fetch(`${record.serverUrl}/api/updates/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productSlug: product, credential: record.updateCredential }),
    signal: AbortSignal.timeout(5000),
  });
  const authData = await authResponse.json().catch(() => null);
  if (!authResponse.ok) {
    console.error(`更新授权失败: ${authData?.error?.message ?? `HTTP ${authResponse.status}`}`);
    console.error('已安装版本仍可正常使用。');
    process.exit(1);
  }
  downloadUrl = authData.downloadUrl;
  sha256 = authData.release.sha256;
}

// 3. 下载并校验
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hunter-update-'));
const tgzPath = path.join(tmpDir, 'package.tar.gz');
console.log('下载新版本...');
const downloadResponse = await fetch(downloadUrl, { signal: AbortSignal.timeout(120000) });
if (!downloadResponse.ok) {
  console.error(`下载失败: HTTP ${downloadResponse.status}`);
  process.exit(1);
}
fs.writeFileSync(tgzPath, Buffer.from(await downloadResponse.arrayBuffer()));
const actualSha = crypto.createHash('sha256').update(fs.readFileSync(tgzPath)).digest('hex');
if (actualSha !== String(sha256).toLowerCase()) {
  console.error('安装包校验失败(与发布哈希不一致),已中止。已安装版本未改动。');
  process.exit(1);
}
console.log('SHA-256 校验通过');

runInvocation({ command: 'tar', prefixArgs: [] }, ['-xzf', tgzPath, '-C', tmpDir]);
const packageDir = findPackageRoot(tmpDir);
if (!packageDir) {
  console.error('安装包内容不正确,已中止。已安装版本未改动。');
  process.exit(1);
}

// 4. 备份当前 skills(按新包的 distribution.json 清单)
const receipt = JSON.parse(fs.readFileSync(path.join(packageDir, 'distribution.json'), 'utf8'));
const skills = (receipt.skills ?? []).map(({ id }) => id);
const backupDir = path.join(targets.stateRoot, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
const skillsRoots = targets.skillRoots;
const backups = [];
for (const root of skillsRoots) {
  for (const skill of skills) {
    const source = path.join(root, skill);
    if (!fs.existsSync(source)) continue;
    const target = path.join(backupDir, encodeURIComponent(root), skill);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
    backups.push({ source, target });
  }
}
if (backups.length > 0) console.log(`已备份当前版本到 ${backupDir}`);

// 5. 覆盖安装 + 诊断;失败则回滚 skills
const installArgs = [
  path.join(packageDir, 'install.mjs'),
  '--force',
  '--product', product,
  '--version', latest.version,
  '--server', record.serverUrl,
];
if (record.updateCredential) installArgs.push('--update-credential', record.updateCredential);
installArgs.push('--agent', targets.detectedAgent ?? targets.requestedAgent);
installArgs.push('--project-dir', targets.projectDir);
installArgs.push('--skills-dir', targets.skillRoots[0]);
installArgs.push('--state-dir', targets.stateRoot);

const nodeInvocation = { command: process.execPath, prefixArgs: [] };
const installResult = spawnInvocation(nodeInvocation, installArgs, { stdio: 'inherit' });
const doctorResult = installResult.status === 0
  ? spawnInvocation(nodeInvocation, [
    path.join(targets.stateRoot, 'packages', product, 'doctor.mjs'),
    '--agent', targets.detectedAgent ?? targets.requestedAgent,
    '--project-dir', targets.projectDir,
    '--skills-dir', targets.skillRoots[0],
    '--state-dir', targets.stateRoot,
  ], { stdio: 'inherit' })
  : installResult;

if (doctorResult.status !== 0) {
  console.error('\n更新后诊断未通过,正在回滚到旧版本...');
  for (const { source, target } of backups) {
    fs.rmSync(source, { recursive: true, force: true });
    fs.cpSync(target, source, { recursive: true });
  }
  console.error('已回滚 skills。若插件运行时有异常,请重新安装旧版本包。');
  // 常见根因提示:插件注册指向已清理的临时目录时,本次升级必然失败,
  // 只回滚 skills 不会修复它(2026-09-18 真机故障)。
  const isolatedRuntime = fs.existsSync(path.join(targets.stateRoot, 'packages', product, 'runtime', 'opencli.mjs'));
  const dangling = isolatedRuntime ? [] : findDanglingPluginRegistrations();
  if (dangling.length > 0) {
    console.error('\n检测到悬空/易悬空的插件注册:');
    for (const problem of dangling) {
      console.error(`  - ${problem.name}: ${problem.reason}`);
    }
    console.error('修复:删除 ~/.opencli/plugins/ 下对应悬空软链,并从 ~/.opencli/plugins.lock.json');
    console.error('移除该插件记录,然后重跑本次更新;新版安装器会自动把插件注册到持久目录。');
  }
  process.exit(1);
}

console.log(`\n✓ 已更新到 v${latest.version}`);

function semverGt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}
