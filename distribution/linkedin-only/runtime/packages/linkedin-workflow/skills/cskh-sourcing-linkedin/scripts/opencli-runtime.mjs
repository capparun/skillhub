import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Installed Skills bind to the installation receipt; reject conflicting overrides.
// Repository Skills automatically use the project's pinned, isolated launcher.
export function opencliInvocation(override = '', environment = process.env) {
  let entry = override || environment.HUNTER_OPENCLI_ENTRY || environment.OPENCLI_BIN;
  const receipt = new URL('./opencli-entry.json', import.meta.url);
  if (fs.existsSync(receipt)) {
    const installed = JSON.parse(fs.readFileSync(receipt, 'utf8')).entry;
    if (typeof installed !== 'string' || !path.isAbsolute(installed) || !fs.existsSync(installed)) throw new Error('产品 OpenCLI 安装指针无效，请检查安装回执');
    if (entry && path.resolve(entry) !== path.resolve(installed)) throw Object.assign(new Error('运行入口与安装回执不一致。请移除本次调用的 HUNTER_OPENCLI_ENTRY / OPENCLI_BIN 覆盖，使用 Skill scripts/opencli.mjs。'), {code:'runtime_entry_mismatch'});
    entry = installed;
    if (typeof entry !== 'string' || !fs.existsSync(entry)) throw new Error('产品 OpenCLI 入口不可用，请重新安装该产品');
  }
  if (!entry) {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    while (path.dirname(dir) !== dir) {
      const bundled = path.join(dir, 'runtime', 'opencli.mjs');
      if (fs.existsSync(bundled)) { entry = bundled; break; }
      const pkg = path.join(dir, 'package.json');
      if (fs.existsSync(pkg)) {
        try {
          if (JSON.parse(fs.readFileSync(pkg, 'utf8')).name === 'hunter-workspace') {
            entry = path.join(dir, 'scripts', 'opencli.mjs'); break;
          }
        } catch { /* Continue to the next ancestor. */ }
      }
      dir = path.dirname(dir);
    }
  }
  if (entry && /\.(?:mjs|cjs|js)$/i.test(entry)) {
    return {command:process.execPath,prefix:[entry],shell:false};
  }
  return {command:entry || (process.platform === 'win32' ? 'opencli.cmd' : 'opencli'),prefix:[],
    shell:process.platform === 'win32' && !entry};
}
