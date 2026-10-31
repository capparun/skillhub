import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
/** Resolve npm to its JavaScript entry so Windows never reparses a spaced cwd. */
export function resolveNpmInvocation() {
    const candidates = [
        process.env.NPM_CLI_JS,
        process.env.npm_execpath,
        path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        process.env.APPDATA
            ? path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js')
            : null,
    ].filter(Boolean);
    const entry = candidates.find(candidate => isJavaScriptFile(candidate));
    if (entry)
        return { command: process.execPath, prefixArgs: [entry] };
    if (process.platform !== 'win32')
        return { command: 'npm', prefixArgs: [] };
    throw new Error('无法定位 npm-cli.js。请确认 Node.js/npm 安装完整，或设置 NPM_CLI_JS 指向 npm-cli.js。');
}
/** Resolve bundled OpenCLI to its JavaScript bin entry instead of a .cmd shim. */
export function resolveOpencliInvocation(runtimeRoot) {
    const override = process.env.OPENCLI_BIN;
    if (override) {
        if (isJavaScriptFile(override)) {
            return { command: process.execPath, prefixArgs: [override] };
        }
        if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(override)) {
            const fromShim = resolveOpencliPackageEntry([
                path.join(path.dirname(override), 'node_modules', '@jackwener', 'opencli', 'package.json'),
                path.resolve(path.dirname(override), '..', '@jackwener', 'opencli', 'package.json'),
            ]);
            if (fromShim)
                return { command: process.execPath, prefixArgs: [fromShim] };
            throw new Error('OPENCLI_BIN 指向 .cmd/.bat，但无法解析对应的 OpenCLI JS 入口。请将 OPENCLI_BIN 直接指向 OpenCLI 的 JS 入口。');
        }
        return { command: override, prefixArgs: [] };
    }
    const launcher = path.join(runtimeRoot, 'opencli.mjs');
    if (fs.existsSync(launcher))
        return { command: process.execPath, prefixArgs: [launcher] };
    const packageFile = path.join(runtimeRoot, 'node_modules', '@jackwener', 'opencli', 'package.json');
    const bundledEntry = resolveOpencliPackageEntry([packageFile]);
    if (bundledEntry)
        return { command: process.execPath, prefixArgs: [bundledEntry] };
    if (process.platform !== 'win32')
        return { command: 'opencli', prefixArgs: [] };
    throw new Error('无法定位 OpenCLI 的 JavaScript 入口。请重新安装运行时，或设置 OPENCLI_BIN。');
}
export function spawnInvocation(invocation, args, options = {}) {
    return spawnSync(invocation.command, [...invocation.prefixArgs, ...args], {
        encoding: 'utf8',
        ...options,
        shell: false,
    });
}
export function runInvocation(invocation, args, options = {}) {
    const result = spawnInvocation(invocation, args, { stdio: 'inherit', ...options });
    if (result.error)
        throw result.error;
    if (result.status !== 0) {
        throw new Error(`${path.basename(invocation.command)} 执行失败，退出码 ${result.status}`);
    }
    return result;
}
function isJavaScriptFile(candidate) {
    return typeof candidate === 'string'
        && /\.(?:cjs|mjs|js)$/i.test(candidate)
        && fs.existsSync(candidate);
}
function resolveOpencliPackageEntry(packageFiles) {
    for (const packageFile of packageFiles) {
        if (!fs.existsSync(packageFile))
            continue;
        const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
        const declaredBin = typeof packageJson.bin === 'string'
            ? packageJson.bin
            : packageJson.bin?.opencli ?? Object.values(packageJson.bin ?? {})[0];
        if (!declaredBin)
            continue;
        const entry = path.resolve(path.dirname(packageFile), declaredBin);
        if (fs.existsSync(entry))
            return entry;
    }
    return null;
}
