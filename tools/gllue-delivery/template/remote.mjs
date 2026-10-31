import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PRODUCT, Failure, hash, inspectPackage, locate, install } from './lifecycle.mjs';
export function newer(a, b) { const parse = s => { const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(s); if (!m)
    throw new Failure('VERSION', '非法产品版本: ' + s); return { base: m.slice(1, 4).map(Number), pre: m[4]?.split('.') }; }; const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++)
    if (x.base[i] !== y.base[i])
        return x.base[i] > y.base[i]; if (!x.pre || !y.pre)
    return !x.pre && !!y.pre; for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const v = x.pre[i], w = y.pre[i];
    if (v === w)
        continue;
    if (v === undefined)
        return false;
    if (w === undefined)
        return true;
    const vn = /^\d+$/.test(v), wn = /^\d+$/.test(w);
    if (vn && wn)
        return +v > +w;
    if (vn !== wn)
        return !vn;
    return v > w;
} return false; }
async function request(url) { const u = new URL(url); if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)))
    throw new Failure('URL', '下载/服务地址必须HTTPS'); const r = await fetch(u, { signal: AbortSignal.timeout(60000) }); if (!r.ok)
    throw new Failure('HTTP', '请求失败: ' + r.status); return r; }
export async function acquire(url, sha, stateRoot) {
    const id = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    const work = path.join(stateRoot, 'staging', PRODUCT, 'download-' + id);
    fs.mkdirSync(work, { recursive: true });
    const logPath = path.join(work, 'download.jsonl');
    let phase = 'download';
    const emit = x => fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), phase, ...x }) + '\n');
    try {
        if (!/^[a-f0-9]{64}$/i.test(sha ?? ''))
            throw new Failure('HASH_REQUIRED', '必须提供分发清单SHA-256');
        let start = Date.now();
        emit({ event: 'start' });
        const r = await request(url);
        const chunks = [];
        let size = 0;
        for await (const c of r.body) {
            size += c.length;
            if (size > 128 * 1024 * 1024)
                throw new Failure('SIZE', '归档超过128MB');
            chunks.push(c);
        }
        const bytes = Buffer.concat(chunks);
        if (hash(bytes) !== sha.toLowerCase())
            throw new Failure('HASH_MISMATCH', '归档SHA-256不匹配');
        const archive = path.join(work, 'package.tar.gz');
        fs.writeFileSync(archive, bytes, { mode: 0o600 });
        emit({ event: 'end', durationMs: Date.now() - start, size });
        phase = 'archive-preflight';
        start = Date.now();
        emit({ event: 'start' });
        const tar = a => { const x = spawnSync('tar', a, { encoding: 'utf8', shell: false, timeout: 60000, maxBuffer: 8 * 1024 * 1024 }); if (x.status !== 0)
            throw new Failure('ARCHIVE', 'tar检查/解压失败'); return x.stdout; };
        const names = tar(['-tzf', archive]).trim().split('\n');
        const roots = new Set();
        for (const raw of names) {
            const n = raw.replace(/^\.\//, '');
            if (!n)
                continue;
            if (n.startsWith('/') || n.includes('\\') || n.includes(':') || n.split('/').includes('..'))
                throw new Failure('ARCHIVE_PATH', '非法归档路径');
            roots.add(n.split('/')[0]);
        }
        if (roots.size !== 1)
            throw new Failure('ARCHIVE_ROOT', '归档必须只有一个产品根目录');
        const listing = tar(['-tvzf', archive]);
        if (listing.split('\n').filter(Boolean).some(line => !['-', 'd'].includes(line[0])))
            throw new Failure('ARCHIVE_LINK', '归档不得包含软链接、硬链接或特殊文件');
        emit({ event: 'end', durationMs: Date.now() - start });
        phase = 'extract';
        start = Date.now();
        emit({ event: 'start' });
        tar(['-xzf', archive, '-C', work]);
        const source = path.join(work, [...roots][0]);
        inspectPackage(source);
        emit({ event: 'end', durationMs: Date.now() - start });
        return { source, logPath };
    }
    catch (e) {
        emit({ event: 'error', code: e.code ?? 'DOWNLOAD', message: e.message });
        e.logPath = logPath;
        e.phase = phase;
        throw e;
    }
}
async function performUpdate(o = {}) {
    const loc = locate(o);
    if (!loc.record)
        throw new Failure('NOT_INSTALLED', '没有原安装回执');
    let source, downloadLog;
    if (o.from) {
        const acquired = await acquire(o.from, o.sha256, loc.stateRoot);
        source = acquired.source;
        downloadLog = acquired.logPath;
    }
    else {
        if (!loc.record.serverUrl)
            throw new Failure('SERVER_REQUIRED', '回执缺少官方分发站；使用明确的候选包URL和SHA升级');
        const latest = await (await request(loc.record.serverUrl + '/api/releases/latest?product=' + PRODUCT)).json();
        if (latest.product?.slug !== PRODUCT)
            throw new Failure('PRODUCT', '分发站产品不匹配');
        const available = newer(latest.version, loc.record.version);
        if (o.check || !available)
            return { ok: true, data: { current: loc.record.version, latest: latest.version, updateAvailable: available, changed: false } };
        if (loc.record.updateCredential)
            throw new Failure('AUTH_REQUIRED', '本谷露公开候选不实现付费凭据交换；不更改旧凭据');
        const acquired = await acquire(latest.downloadUrl, latest.sha256, loc.stateRoot);
        source = acquired.source;
        downloadLog = acquired.logPath;
        if (inspectPackage(source).version !== latest.version)
            throw new Failure('VERSION_MISMATCH', '下载包版本与分发清单不一致');
    }
    return { ...await install(source, { ...o, stateRoot: loc.stateRoot, version: o.version }), downloadLog };
}
export async function update(o = {}) {
    const loc = locate(o), dir = path.join(loc.stateRoot, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const logPath = path.join(dir, 'update-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.jsonl');
    const start = Date.now();
    const emit = v => fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), phase: 'update', ...v }) + '\n', { mode: 0o600 });
    emit({ event: 'start' });
    try {
        const result = await performUpdate(o);
        emit({ event: result.ok ? 'end' : 'error', durationMs: Date.now() - start, code: result.error?.code });
        return { ...result, updateLog: logPath };
    }
    catch (e) {
        emit({ event: 'error', durationMs: Date.now() - start, code: e.code ?? 'UPDATE', message: e.message });
        return { ok: false, error: { code: e.code ?? 'UPDATE', message: e.message, phase: e.phase ?? 'update' }, logPath: e.logPath ?? logPath, updateLog: logPath, currentInstallation: 'not_modified', nextAction: '查看日志，修正明确错误后重新运行官方update入口' };
    }
}
