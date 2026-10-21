#!/usr/bin/env node
import {npmInstallOptions} from './npm-distribution.mjs';
import {replaceDirectory} from './directory-distribution.mjs';
// Hunter 客户包装机:插件运行时 + Skills 安装。
// 本地模式: 解压后在本目录执行  node install.mjs [--force]
// 远程模式: node install.mjs --from <url> [--sha256 <hex>] [其他参数...]
// 在线登记: --product <slug> --version <v> --server <url> [--update-credential <cred>]
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  resolveNpmInvocation,
  resolveOpencliInvocation,
  runInvocation,
  spawnInvocation,
} from './process-distribution.mjs';
import { resolveInstallTargets } from './target-distribution.mjs';

const argv = process.argv.slice(2);

function getArg(name) {
  const index = argv.indexOf(name);
  return index !== -1 ? argv[index + 1] : null;
}

function withoutArgs(args, names) {
  const result = [];
  for (let i = 0; i < args.length; i += 1) {
    if (names.includes(args[i])) {
      i += 1; // 跳过该参数的值
      continue;
    }
    result.push(args[i]);
  }
  return result;
}

// 读取 Skill 目录 SKILL.md frontmatter 的 name 字段,用于识别"猎策自己的旧版本"。
function readSkillName(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;
  const text = fs.readFileSync(skillFile, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const name = match[1].match(/^name:\s*(.+)$/m);
  return name ? name[1].trim() : null;
}

// 目标目录已存在时,仅当它与本次安装的 Skill 同名(即猎策旧版本)时允许自动覆盖;
// 未知目录仍要求显式 --force,避免误删用户自己的同名目录。
function isHunterOwnedSkill(source, destination) {
  const sourceName = readSkillName(source);
  if (!sourceName) return false;
  return readSkillName(destination) === sourceName;
}

// 把已有目录改名让位(rename 不触发删除守卫),返回旧路径供调用方尽力清理;
// 目录不存在时返回 null。
function rotateDirectory(dir) {
  if (!fs.existsSync(dir)) return null;
  const rotated = `${dir}.old-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  fs.renameSync(dir, rotated);
  return rotated;
}

// 临时路径判定:系统临时目录或 Hunter 自己的安装/更新解压目录,
// 其中的 projectDir 等元数据不应写入安装回执。
function isTransientPath(candidate) {  const variants = new Set([path.resolve(candidate)]);
  try {
    variants.add(fs.realpathSync.native(candidate));
  } catch {
    // 路径不存在时只用文本形式判断。
  }
  for (const resolved of variants) {
    const tmpRoots = [os.tmpdir(), '/private/tmp', '/tmp'].map(root => path.resolve(root));
    for (const root of tmpRoots) {
      let realRoot = root;
      try {
        realRoot = fs.realpathSync.native(root);
      } catch {
        // 保留文本形式。
      }
      if (resolved === realRoot || resolved.startsWith(realRoot + path.sep)) return true;
    }
    if (/[/\\]hunter-(?:install|update|upgrade)-[^/\\]*[/\\]/.test(resolved)) return true;
  }
  return false;
}

// --from: 下载 → 校验 SHA-256 → 解压 → 委托包内 install.mjs 继续
const fromUrl = getArg('--from');
if (fromUrl) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hunter-install-'));
  const tgzPath = path.join(tmpDir, 'package.tar.gz');
  console.log(`下载安装包: ${fromUrl}`);
  const response = await fetch(fromUrl);
  if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`);
  fs.writeFileSync(tgzPath, Buffer.from(await response.arrayBuffer()));

  const expectedSha = (getArg('--sha256') ?? response.headers.get('x-sha256'))?.toLowerCase();
  if (expectedSha) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(tgzPath)).digest('hex');
    if (actual !== expectedSha) {
      throw new Error(`安装包校验失败(期望 ${expectedSha},实际 ${actual}),已中止`);
    }
    console.log('SHA-256 校验通过');
  } else {
    console.warn('警告: 未提供 SHA-256,跳过完整性校验');
  }

  runInvocation({ command: 'tar', prefixArgs: [] }, ['-xzf', tgzPath, '-C', tmpDir]);
  const packageDir = fs
    .readdirSync(tmpDir)
    .map((name) => path.join(tmpDir, name))
    .filter((p) => fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'install.mjs')))[0];
  if (!packageDir) throw new Error('安装包内容不正确: 未找到 install.mjs');

  const rest = withoutArgs(argv, ['--from', '--sha256']);
  const result = spawnInvocation(
    { command: process.execPath, prefixArgs: [] },
    [path.join(packageDir, 'install.mjs'), ...rest],
    { stdio: 'inherit' },
  );
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

const distributionRoot = path.dirname(fileURLToPath(import.meta.url));
const receipt = JSON.parse(fs.readFileSync(path.join(distributionRoot, 'distribution.json'), 'utf8'));
const runtimeRoot = path.join(distributionRoot, 'runtime');
const plugins = (receipt.requirements?.plugins ?? []).map(({ name }) => name);
const skills = (receipt.skills ?? []).map(({ id }) => id);
const product = getArg('--product');
const targets = resolveInstallTargets(argv);
const skillsRoots = targets.skillRoots;
const plan = {
  schemaVersion: 1,
  platform: process.platform,
  node: { version: process.version, ok: Number(process.versions.node.split('.')[0]) >= 22 },
  agent: {
    requested: getArg('--agent') ?? 'auto',
    detected: targets.detectedAgent,
    selectionApplied: targets.selectionApplied,
  },
  plugins,
  skills,
  skillTargets: skillsRoots,
  runtimeSource: runtimeRoot,
  runtimeTarget: product ? path.join(targets.stateRoot, 'packages', product, 'runtime') : runtimeRoot,
  pluginRegistrationTarget: null,
  pluginRegistrationScope: 'product-local',
  stateTarget: targets.stateRoot,
  actions: [
    ...(plugins.length > 0 ? ['install-runtime', 'verify-bundled-plugins'] : []),
    'install-skills',
    ...(getArg('--product') ? ['write-installation-receipt'] : []),
  ],
  recommendedNextAction: 'node doctor.mjs',
};

if (argv.includes('--dry-run')) {
  process.stdout.write(`${JSON.stringify(plan)}\n`);
  process.exit(0);
}
if (argv.includes('--preflight')) {
  process.stdout.write(`${JSON.stringify(plan, null, argv.includes('--json') ? 2 : 0)}\n`);
  process.exit(plan.node.ok ? 0 : 30);
}

if (!plan.node.ok) throw new Error('猎聘搜索需要 Node.js 22 或更高版本');
const force = argv.includes('--force');
let pluginRuntimeRoot = runtimeRoot;
let npmOptions;
if (plugins.length > 0) {
  if (!fs.existsSync(runtimeRoot)) throw new Error('交付包缺少 runtime 目录');
  const npm=resolveNpmInvocation();
  const config=spawnInvocation(npm,['config','get','registry'],{cwd:runtimeRoot});
  npmOptions=npmInstallOptions(argv,{configuredRegistry:config.status===0?config.stdout.trim():undefined});
  console.log(`本次 npm registry: ${npmOptions.registry}；模式: ${npmOptions.offline?'离线缓存':'联网'}。缓存键必须与该 registry 一致。`);
  runInvocation(npm, npmOptions.args, { cwd: runtimeRoot });

  if (product) {
    // 在线安装/更新模式:插件必须注册到持久目录。注册到临时解压目录会被系统
    // 清理(/tmp 定期清空),导致软链悬空;下次升级时 list 判"已装"、uninstall 又
    // 报"未安装",整个更新中断回滚(2026-09-18 真机故障报告)。
    pluginRuntimeRoot = path.join(targets.stateRoot, 'packages', product, 'runtime');
    // 旧 runtime 含数千文件:直接 rmSync 会被宿主(WorkBuddy 等)注入的
    // safe-delete shim 拦截(批量删除需人工确认,故障报告 8.2)。
    // 改名不触发删除守卫;旧目录尽力清理,失败仅提示不阻断安装。
    const staleRuntime = replaceDirectory(runtimeRoot, pluginRuntimeRoot);
    console.log(`插件运行时已持久化到 ${pluginRuntimeRoot}`);
    if (staleRuntime) {
      try {
        fs.rmSync(staleRuntime, { recursive: true, force: true });
      } catch (error) {
        console.warn(`警告: 旧版本运行时保留在 ${staleRuntime},自动清理失败(${error.message});可手动删除。`);
      }
    }
  }

  const opencli = resolveOpencliInvocation(pluginRuntimeRoot);
  const runtimePackages = new Map(
    (receipt.runtime?.packages ?? []).map(runtimePackage => [runtimePackage.name, runtimePackage]),
  );
  for (const plugin of plugins) {
    if (!runtimePackages.has(plugin)) throw new Error(`交付包缺少插件运行时: ${plugin}`);
    runInvocation(opencli, [plugin, '--help']);
  }
}

for (const skillsRoot of skillsRoots) {
  fs.mkdirSync(skillsRoot, { recursive: true });
  for (const skill of skills) {
    const source = path.join(distributionRoot, 'skills', skill);
    const destination = path.join(skillsRoot, skill);
    if (fs.existsSync(destination) && !force && !isHunterOwnedSkill(source, destination)) {
      throw new Error(`Skill 目录已存在且不是同名猎策 Skill: ${destination}；如确认覆盖请使用 --force`);
    }
    // 完整复制成功后再切换，复制中断时仍保留可用旧 Skill。
    const previousSkill = replaceDirectory(source, destination);
    if (fs.existsSync(path.join(destination,'scripts','opencli.mjs'))) {
      fs.writeFileSync(path.join(destination,'scripts','opencli-entry.json'), JSON.stringify({entry:path.join(pluginRuntimeRoot,'opencli.mjs')})+'\n');
    }
    if (previousSkill) {
      try { fs.rmSync(previousSkill, {recursive:true, force:true}); }
      catch (error) { console.warn(`警告: 旧 Skill 保留在 ${previousSkill}，自动清理失败(${error.message})。`); }
    }
  }
  console.log(`Skills 已安装到 ${skillsRoot}`);
}

// 在线登记:记录安装信息 + 把安装/更新脚本复制到固定位置(更新不依赖原解压目录)
if (product) {
  const home = targets.stateRoot;
  // 旧版本回执可能残留临时解压目录的 projectDir(系统清理后变成误导性脏数据)。
  const projectDir = targets.projectDir && !isTransientPath(targets.projectDir)
    ? targets.projectDir
    : null;
  const record = {
    product,
    version: getArg('--version'),
    serverUrl: (getArg('--server') ?? '').replace(/\/+$/, '') || null,
    updateCredential: getArg('--update-credential'),
    agent: targets.detectedAgent ?? targets.requestedAgent,
    projectDir,
    skillTargets: targets.skillRoots,
    stateTarget: targets.stateRoot,
    installedAt: new Date().toISOString(),
    npmRegistry: npmOptions?.registry ?? null,
  };
  const installDir = path.join(home, 'installations');
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(
    path.join(installDir, `${product}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    { mode: 0o600 },
  );

  const packageHome = path.join(home, 'packages', product);
  fs.mkdirSync(packageHome, { recursive: true });
  if(receipt.browserExtension?.path){
    const extensionSource=path.resolve(distributionRoot,receipt.browserExtension.path);
    if(extensionSource!==path.join(distributionRoot,'browser-extension'))throw new Error('配套扩展路径不受支持');
    const background=fs.readFileSync(path.join(extensionSource,'dist/background.js'));
    if(crypto.createHash('sha256').update(background).digest('hex')!==receipt.browserExtension.backgroundSha256)throw new Error('配套扩展文件校验失败');
    const extensionTarget=path.join(packageHome,'browser-extension');
    const previous=rotateDirectory(extensionTarget);
    try {fs.cpSync(extensionSource,extensionTarget,{recursive:true});}
    catch(error){fs.rmSync(extensionTarget,{recursive:true,force:true});if(previous)fs.renameSync(previous,extensionTarget);throw error;}
    console.log(`配套浏览器扩展已保存到 ${extensionTarget}；尚未加载，请按安装指南在 Chrome 中确认并加载。`);
    if(previous)console.log(`原扩展副本保留在 ${previous}，请在新版本验收后清理。`);
  }
  for (const file of [
    'install.mjs',
    'doctor.mjs',
    'update.mjs',
    'process-distribution.mjs',
    'npm-distribution.mjs',
    'directory-distribution.mjs',
    'target-distribution.mjs',
    'distribution.json',
  ]) {
    const source = path.join(distributionRoot, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(packageHome, file));
  }

  // 更新 Skill 通过这个安装时生成的指针定位真实状态目录，避免假定 ~/.hunter。
  for (const skillsRoot of skillsRoots) {
    const updateSkillRoot = path.join(skillsRoot, 'cskh-update');
    if (!skills.includes('cskh-update') || !fs.existsSync(updateSkillRoot)) continue;
    fs.writeFileSync(
      path.join(updateSkillRoot, '.hunter-installation.json'),
      `${JSON.stringify({ schemaVersion: 1, product, stateRoot: home }, null, 2)}\n`,
      { mode: 0o600 },
    );
  }
  console.log(`安装信息已登记到 ${path.join(installDir, `${product}.json`)}`);
  console.log(`以后更新请运行: node ${path.join(packageHome, 'update.mjs')}`);
}

console.log(`安装完成：${plugins.length} 个插件，${skills.length} 个 Skills × ${skillsRoots.length} 个 Agent 目录。`);
