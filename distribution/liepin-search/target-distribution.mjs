import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function getArg(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1] ?? null;
}

export function inferStateRootFromUpdater(scriptPath, product) {
  if (!scriptPath || !product) return null;
  const scriptDir = path.dirname(path.resolve(scriptPath));
  if (path.basename(scriptDir) !== product) return null;
  const packagesDir = path.dirname(scriptDir);
  if (path.basename(packagesDir) !== 'packages') return null;
  return path.dirname(packagesDir);
}

export function resolveInstallTargets(argv = process.argv.slice(2), env = process.env) {
  const requested = getArg(argv, '--agent') ?? env.HUNTER_AGENT ?? 'auto';
  const projectDir = path.resolve(getArg(argv, '--project-dir') ?? env.HUNTER_PROJECT_DIR ?? process.cwd());
  const detected = requested === 'auto' ? (isTransientDir(projectDir) && !getArg(argv, '--project-dir') && !env.HUNTER_PROJECT_DIR ? null : detectAgent(env, projectDir)) : requested;
  const explicitSkills = getArg(argv, '--skills-dir') ?? env.HUNTER_SKILLS_DIR;
  const explicitState = getArg(argv, '--state-dir') ?? env.HUNTER_STATE_DIR;

  let skillRoots;
  if (explicitSkills) {
    skillRoots = [path.resolve(explicitSkills)];
  } else if (getArg(argv, '--project-dir') || env.HUNTER_PROJECT_DIR || requested !== 'auto' || detected) {
    skillRoots = [projectSkillRoot(detected ?? 'generic', projectDir)];
  } else {
    const candidates = ['.workbuddy/skills', '.claude/skills', '.agents/skills']
      .map(relative => path.join(os.homedir(), relative));
    const existing = candidates.filter(directory => fs.existsSync(directory));
    skillRoots = existing.length > 0 ? existing : [path.join(os.homedir(), '.agents', 'skills')];
  }

  const stateRoot = explicitState
    ? path.resolve(explicitState)
    : detected === 'trae'
      ? path.join(projectDir, '.hunter')
      : process.platform === 'win32' && env.LOCALAPPDATA
        ? path.join(env.LOCALAPPDATA, 'Hunter')
        : path.join(os.homedir(), '.hunter');

  return {
    requestedAgent: requested,
    detectedAgent: detected,
    projectDir,
    skillRoots,
    stateRoot,
    selectionApplied: Boolean(explicitSkills || getArg(argv, '--project-dir') || requested !== 'auto' || detected),
  };
}

function detectAgent(env, projectDir) {
  if (env.TRAE_AGENT || env.TRAE_IDE) return 'trae';
  if (env.WORKBUDDY_AGENT || env.WORKBUDDY_HOME) return 'workbuddy';
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return 'claude-code';
  if (env.CODEX_HOME || env.CODEX_THREAD_ID) return 'codex';
  if (fs.existsSync(path.join(projectDir, '.trae'))) return 'trae';
  if (fs.existsSync(path.join(projectDir, '.claude'))) return 'claude-code';
  return null;
}

function projectSkillRoot(agent, projectDir) {
  if (agent === 'claude-code') return path.join(projectDir, '.claude', 'skills');
  if (agent === 'workbuddy') return path.join(projectDir, '.workbuddy', 'skills');
  return path.join(projectDir, '.agents', 'skills');
}

// 系统临时目录判定(与 install-distribution.mjs 的 isTransientPath 同源口径)。
function isTransientDir(candidate) {
  const variants = new Set([path.resolve(candidate)]);
  try {
    variants.add(fs.realpathSync.native(candidate));
  } catch {
    // 路径不存在时只用文本形式判断。
  }
  for (const resolved of variants) {
    for (const root of [os.tmpdir(), '/private/tmp', '/tmp']) {
      let realRoot = path.resolve(root);
      try {
        realRoot = fs.realpathSync.native(realRoot);
      } catch {
        // 保留文本形式。
      }
      if (resolved === realRoot || resolved.startsWith(realRoot + path.sep)) return true;
    }
    if (/[/\\]hunter-(?:install|update|upgrade)-[^/\\]*[/\\]/.test(resolved)) return true;
  }
  return false;
}

/**
 * 发现悬空/易悬空的 opencli 插件注册:
 * - 软链存在但目标已被清理(/tmp 定期清空后的典型状态);
 * - lock 记录指向系统临时目录(尚未悬空,但重启/清理后必然悬空)。
 * 用户自己的 Hunter 状态目录(homeDir/.hunter)按定义是持久落点,不视为临时。
 * 返回 [{ name, reason }],无问题返回空数组。
 */
export function findDanglingPluginRegistrations(homeDir = os.homedir()) {
  const opencliHome = path.join(homeDir, '.opencli');
  const pluginsDir = path.join(opencliHome, 'plugins');
  const stateRoot = path.join(homeDir, '.hunter');
  const problems = [];
  const seen = new Set();

  if (fs.existsSync(pluginsDir)) {
    for (const entry of fs.readdirSync(pluginsDir)) {
      const link = path.join(pluginsDir, entry);
      let stat;
      try {
        stat = fs.lstatSync(link);
      } catch {
        continue;
      }
      if (!stat.isSymbolicLink()) continue;
      let target = null;
      try {
        target = fs.readlinkSync(link);
      } catch {
        // ignore
      }
      // existsSync 对悬空软链返回 false。
      if (!fs.existsSync(link)) {
        problems.push({ name: entry, reason: `软链目标已被清理${target ? `(${target})` : ''}` });
        seen.add(entry);
      }
    }
  }

  const lockFile = path.join(opencliHome, 'plugins.lock.json');
  if (fs.existsSync(lockFile)) {
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    } catch {
      lock = null;
    }
    for (const [name, entry] of Object.entries(lock ?? {})) {
      if (seen.has(name)) continue;
      const registeredPath = entry?.path ?? entry?.source?.path;
      if (
        typeof registeredPath === 'string'
        && isTransientDir(registeredPath)
        && !isPathUnder(registeredPath, stateRoot)
      ) {
        problems.push({ name, reason: `注册路径在临时目录(${registeredPath}),系统清理后必然悬空` });
      }
    }
  }

  return problems;
}

function isPathUnder(candidate, root) {
  const variants = new Set([path.resolve(candidate)]);
  try {
    variants.add(fs.realpathSync.native(candidate));
  } catch {
    // 路径不存在时只用文本形式判断。
  }
  const roots = new Set([path.resolve(root)]);
  try {
    roots.add(fs.realpathSync.native(root));
  } catch {
    // 保留文本形式。
  }
  for (const variant of variants) {
    for (const resolvedRoot of roots) {
      if (variant === resolvedRoot || variant.startsWith(resolvedRoot + path.sep)) return true;
    }
  }
  return false;
}
