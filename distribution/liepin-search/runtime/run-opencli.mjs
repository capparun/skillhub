import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Pinned 2.0 host: load explicit product plugins, never discover shared user plugins. */
export async function runOpencli(pluginRoots) {
  const entry = import.meta.resolve('@jackwener/opencli');
  const packageRoot = path.resolve(path.dirname(fileURLToPath(entry)), '../..');
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.version !== '2.0.0') throw new Error(`需要项目 OpenCLI 2.0.0，实际为 ${metadata.version}`);
  const { isIgnorableDaemonPortEnv, unsupportedDaemonPortEnvMessage } = await import(new URL('./constants.js', entry));
  const { isSupportedNodeVersion } = await import(new URL('./runtime-detect.js', entry));
  if (!isSupportedNodeVersion(process.version)) throw new Error(`OpenCLI 不支持 Node.js ${process.version}`);
  if (!isIgnorableDaemonPortEnv(process.env.OPENCLI_DAEMON_PORT)) {
    throw new Error(unsupportedDaemonPortEnvMessage(process.env.OPENCLI_DAEMON_PORT));
  }
  if (['--version', '-V'].includes(process.argv[2])) {
    console.log(metadata.version);
    return;
  }
  // These internal entry points are pinned and covered by actual CLI smoke tests.
  // Do not import main.js: its discovery rewrites ~/.opencli/plugins/* dependencies.
  const { discoverClis } = await import(new URL('./discovery.js', entry));
  const { runCli } = await import(new URL('./cli.js', entry));
  const { installNodeNetwork } = await import(new URL('./node-network.js', entry));
  const { escapeLeadingDashPositional } = await import(new URL('./cli-argv-preprocess.js', entry));
  const builtin = path.join(packageRoot, 'clis');
  installNodeNetwork();
  await discoverClis(builtin);
  for (const root of pluginRoots) {
    for (const name of fs.readdirSync(root).filter(name => name.endsWith('.js')).sort()) {
      await import(pathToFileURL(path.join(root, name)));
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'cli-manifest.json'), 'utf8'));
  if (Array.isArray(manifest)) {
    process.argv.splice(2, process.argv.length - 2, ...escapeLeadingDashPositional(process.argv.slice(2), manifest));
  }
  await runCli(builtin, path.join(os.homedir(), '.opencli', 'clis'));
}
