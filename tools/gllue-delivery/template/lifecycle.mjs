import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveNpmInvocation } from './process-distribution.mjs';
import { npmInstallOptions } from './npm-distribution.mjs';
export const PRODUCT = 'gllue-only';
export const PACKAGE = path.dirname(fileURLToPath(import.meta.url));
export const hash = b => crypto.createHash('sha256').update(b).digest('hex');
export const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = p => fs.existsSync(p);
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { mode: 0o600 }); };
const inside = (p, r) => p === r || p.startsWith(r + path.sep);
const name = p => fs.readFileSync(p, 'utf8').match(/^name:\s*([^\r\n]+)$/m)?.[1]?.trim();
export class Failure extends Error {
    constructor(code, message, details = []) { super(message); this.code = code; this.details = details; }
}
const fail = (c, m, d) => { throw new Failure(c, m, d); };
export function args(argv) {
    const o = { skillTargets: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (['--json', '--force'].includes(a))
            continue;
        if (['--offline', '--preflight', '--dry-run', '--check'].includes(a)) {
            o[a.slice(2)] = true;
            continue;
        }
        const keys = { '--state-dir': 'stateRoot', '--skills-dir': 'skillTarget', '--pointer': 'pointer', '--version': 'version', '--product': 'product', '--server': 'serverUrl', '--update-credential': 'updateCredential', '--npm-registry': 'registry', '--from': 'from', '--sha256': 'sha256', '--agent': 'agent', '--project-dir': 'projectDir', '--scope': 'scope' };
        if (!keys[a] || !argv[i + 1] || argv[i + 1].startsWith('--'))
            fail('ARGUMENT', '未知参数或缺少值: ' + a);
        const v = argv[++i];
        if (a === '--skills-dir')
            o.skillTargets.push(path.resolve(v));
        else
            o[keys[a]] = v;
    }
    return o;
}
function noLinks(p) { let cursor = path.resolve(p); while (true) {
    if (exists(cursor) && fs.lstatSync(cursor).isSymbolicLink() && !(process.platform === 'darwin' && ['/tmp', '/var', '/etc'].includes(cursor) && fs.realpathSync(cursor) === '/private' + cursor))
        fail('SYMLINK', '路径不可经过软链接: ' + cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor)
        break;
    cursor = parent;
} }
function files(root, prefix = '') {
    const out = [];
    for (const e of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
        const rel = prefix ? prefix + '/' + e.name : e.name;
        if (e.isSymbolicLink())
            fail('PACKAGE_LINK', '包内不允许软链接: ' + rel);
        if (e.isDirectory())
            out.push(...files(root, rel));
        else if (e.isFile())
            out.push(rel);
        else
            fail('PACKAGE_TYPE', '不支持文件类型: ' + rel);
    }
    return out;
}
// Avoid native cpSync path conversion observed on Windows Node 22 with Unicode destinations.
// Copy validated ordinary trees; do not follow links or delete existing directories.
export function copyTree(source, destination) {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) fail('PACKAGE_LINK', '复制源不可为软链接: ' + source);
    if (stat.isDirectory()) {
        fs.mkdirSync(destination, { recursive: true });
        for (const entry of fs.readdirSync(source)) copyTree(path.join(source, entry), path.join(destination, entry));
    } else if (stat.isFile()) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
    } else fail('PACKAGE_TYPE', '不支持复制文件类型: ' + source);
}
export function inspectPackage(root) {
    const errors = [];
    let m;
    try {
        m = read(path.join(root, 'distribution.json'));
    }
    catch (e) {
        fail('PACKAGE', '缺少或无效 distribution.json', [{path: path.join(root, 'distribution.json'), code: e.code ?? 'JSON', message: e.message}]);
    }
    const add = s => errors.push(s);
    if ((m.product ?? m.customer) !== PRODUCT)
        add('产品不是gllue-only');
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(m.version ?? ''))
        add('产品版本无效');
    const required = ['install.mjs', 'update.mjs', 'doctor.mjs', 'manage.mjs', 'lifecycle.mjs', 'runtime/package.json', 'runtime/package-lock.json', 'runtime/opencli.mjs', 'runtime/run-opencli.mjs', 'runtime/packages/gllue/package.json'];
    for (const f of required)
        if (!exists(path.join(root, f)))
            add('缺文件: ' + f);
    let all = [];
    try {
        all = files(root);
    }
    catch (e) {
        add(e.message);
    }
    const integrity = m.integrity ?? {};
    for (const f of all.filter(f => f !== 'distribution.json'))
        if (!integrity[f])
            add('未登记文件: ' + f);
    for (const [f, sha] of Object.entries(integrity)) {
        if (f.includes('\\') || path.isAbsolute(f) || f.split('/').includes('..')) {
            add('非法清单路径: ' + f);
            continue;
        }
        try {
            if (hash(fs.readFileSync(path.join(root, f))) !== sha)
                add('文件哈希错误: ' + f);
        }
        catch {
            add('缺文件: ' + f);
        }
    }
    const ids = new Set();
    for (const s of m.skills ?? []) {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(s.id) || ids.has(s.id)) {
            add('Skill名称非法或重复: ' + s.id);
            continue;
        }
        ids.add(s.id);
        try {
            if (name(path.join(root, 'skills', s.id, 'SKILL.md')) !== s.id)
                add('Skill frontmatter不一致: ' + s.id);
        }
        catch {
            add('Skill缺SKILL.md: ' + s.id);
        }
    }
    if (ids.size === 0)
        add('没有Skill');
    if (errors.length)
        fail('PACKAGE_INVALID', '交付包预检失败', errors);
    return m;
}
export function locate(o = {}, here = PACKAGE) {
    let pointer;
    if (o.pointer) {
        pointer = read(path.resolve(o.pointer));
        // 1.3.1/rc.2 expose the exact runtime entry, but no product/state fields.
        if (!pointer.product && typeof pointer.entry === 'string' && path.isAbsolute(pointer.entry)) {
            const legacyHome=path.dirname(path.dirname(pointer.entry));
            if (path.basename(legacyHome)===PRODUCT && path.basename(path.dirname(legacyHome))==='packages' && pointer.entry===path.join(legacyHome,'runtime','opencli.mjs')) {
                pointer={product:PRODUCT,stateRoot:path.dirname(path.dirname(legacyHome)),legacy:true};
            }
        }
        if (pointer.product !== PRODUCT)
            fail('POINTER', '指针产品不匹配');
    }
    const inferred = path.basename(here) === PRODUCT && path.basename(path.dirname(here)) === 'packages' ? path.dirname(path.dirname(here)) : null;
    const roots = [o.stateRoot, pointer?.stateRoot, inferred].filter(Boolean).map(p => path.resolve(p));
    if (new Set(roots).size > 1)
        fail('LOCATION_CONFLICT', '显式安装根、指针和维护入口不一致', roots);
    if (!roots.length)
        fail('LOCATION_REQUIRED', '新装需指定 --state-dir 和 --skills-dir；升级使用已安装Skill的manage入口。');
    const stateRoot = roots[0];
    noLinks(stateRoot);
    const home = path.join(stateRoot, 'packages', PRODUCT);
    const receiptPath = path.join(stateRoot, 'installations', PRODUCT + '.json');
    const record = exists(receiptPath) ? read(receiptPath) : null;
    if (record) {
        if (record.product !== PRODUCT || path.resolve(record.stateTarget ?? '') !== stateRoot)
            fail('RECEIPT_CONFLICT', '回执产品或安装根冲突');
        if (!Array.isArray(record.skillTargets) || !record.skillTargets.length || record.skillTargets.some(p => !path.isAbsolute(p)))
            fail('RECEIPT_CONFLICT', '回执缺完整Skill目标');
        if (o.skillTargets?.length && JSON.stringify(o.skillTargets.map(p => path.resolve(p))) !== JSON.stringify(record.skillTargets))
            fail('TARGET_CONFLICT', '升级不能变更Skill目标，请沿用原回执');
        if (o.scope && record.scope && o.scope !== record.scope)
            fail('SCOPE_CONFLICT', '升级不能变更作用域');
        if (o.projectDir && record.projectDir && path.resolve(o.projectDir) !== path.resolve(record.projectDir))
            fail('SCOPE_CONFLICT', '升级项目目录冲突');
        if (pointer?.installId && pointer.installId !== record.installId)
            fail('POINTER_CONFLICT', '指针与回执安装身份不一致');
    }
    if (pointer?.legacy && !record) fail('RECEIPT_REQUIRED','旧指针对应回执缺失，拒绝另建安装');
    const skillTargets = record?.skillTargets ?? o.skillTargets ?? [];
    if (!skillTargets.length)
        fail('TARGET_REQUIRED', '首次安装必须显式指定一个或多个 --skills-dir');
    return { stateRoot, home, receiptPath, record, skillTargets: [...new Set(skillTargets.map(p => path.resolve(p)))], scope: record?.scope ?? (record?.projectDir ? 'project' : o.scope ?? 'explicit'), projectDir: record?.projectDir ?? o.projectDir ?? null };
}
function ownSkill(destination, loc, id) {
    if (!exists(destination))
        return !loc.record;
    const p = path.join(destination, '.hunter-installation.json');
    if (exists(p)) {
        const x = read(p);
        return x.product === PRODUCT && path.resolve(x.stateRoot) === loc.stateRoot && x.installId === loc.record?.installId && x.entry === path.join(loc.home, 'manage.mjs');
    }
    // Legacy adoption requires receipt + exact runtime entry + product/name, not name alone.
    const old = path.join(destination, 'scripts', 'opencli-entry.json');
    try {
        if (!loc.record || !loc.record.skillTargets.includes(path.dirname(destination)) || name(path.join(destination, 'SKILL.md')) !== id)
            return false;
        if (exists(old))
            return path.resolve(read(old).entry) === path.join(loc.home, 'runtime', 'opencli.mjs');
        const manifest = read(path.join(loc.home, 'distribution.json'));
        if (manifest.version !== '1.3.0' || loc.record.version !== manifest.version)
            return false;
        const entry = manifest.skills.find(s => s.id === id);
        return entry.files.length > 0 && entry.files.every(f => typeof f.sha256 === 'string' && hash(fs.readFileSync(path.join(destination, f.path))) === f.sha256);
    }
    catch {
        return false;
    }
}
export function preflight(root, o = {}) {
    let manifest;
    const errors = [];
    try {
        manifest = inspectPackage(root);
    }
    catch (e) {
        errors.push(...(e.details?.length ? e.details : [e.message]));
        try {
            manifest = read(path.join(root, 'distribution.json'));
        }
        catch { }
    }
    let loc;
    try {
        loc = locate(o);
    }
    catch (e) {
        errors.push(e.code + ': ' + e.message);
    }
    if (Number(process.versions.node.split('.')[0]) < 22)
        errors.push('需要Node.js22+');
    if (o.product && o.product !== PRODUCT)
        errors.push('请求产品不匹配');
    if (o.version && o.version !== manifest?.version)
        errors.push('请求产品版本与清单不一致');
    if (loc) {
        const retained = maintenance(loc).data.transactions.filter(x => x.status === 'committed');
        if (retained.length >= 10)
            errors.push('已保留10次成功安装；先运行manage maintenance查看保留清单，另行授权清理后再升级');
        if (exists(loc.home) && !loc.record)
            errors.push('安装根已存在但无回执，拒绝覆盖');
        if (loc.record) {
            try {
                const old = read(path.join(loc.home, 'distribution.json'));
                if (old.version !== loc.record.version)
                    errors.push('旧回执版本与清单不一致');
            }
            catch {
                errors.push('旧安装清单无法读取');
            }
        }
        const destinations = [loc.home, loc.receiptPath];
        for (const target of loc.skillTargets)
            for (const s of (manifest?.skills ?? []).filter(s => /^[a-z0-9][a-z0-9-]*$/.test(s.id))) {
                const dest = path.join(target, s.id);
                destinations.push(dest);
                try {
                    noLinks(dest);
                    if (exists(dest) && !ownSkill(dest, loc, s.id))
                        errors.push('无法证明目录归属: ' + dest);
                }
                catch (e) {
                    errors.push(e.message);
                }
            }
        for (const d of destinations) {
            try {
                noLinks(d);
                let parent = path.dirname(d);
                while (!exists(parent))
                    parent = path.dirname(parent);
                fs.accessSync(parent, fs.constants.W_OK);
            }
            catch (e) {
                errors.push('目标不可写: ' + d + ' ' + e.message);
            }
        }
        for (let i = 0; i < destinations.length; i++)
            for (let j = i + 1; j < destinations.length; j++)
                if (inside(destinations[i], destinations[j]) || inside(destinations[j], destinations[i]))
                    errors.push('目标目录重叠');
    }
    if (errors.length)
        fail('PREFLIGHT', '安装预检发现全部冲突', errors);
    return { manifest, loc };
}
function processResult(command, argv, options = {}) { const r = spawnSync(command, argv, { encoding: 'utf8', shell: false, timeout: 180000, maxBuffer: 4 * 1024 * 1024, ...options }); if (r.error || r.status !== 0)
    fail('CHILD_FAILED', '子进程未成功', { status: r.status, code: r.error?.code, stderr: (r.stderr ?? '').slice(-2000) }); return r.stdout; }
function runtimeCheck(home) {
    const entry = path.join(home, 'runtime', 'opencli.mjs');
    const output = processResult(process.execPath, [entry, 'gllue', '--help']);
    const v = processResult(process.execPath, [entry, '--version']).trim();
    const expected = read(path.join(home, 'distribution.json')).requirements.opencli;
    if (v !== expected || !output.includes('check-exists') || !output.includes('get-job'))
        fail('RUNTIME_INVALID', '运行时版本或能力目录不匹配');
    return { opencli: v, commandsLoaded: true };
}
function installDependencies(home, o) {
    const npm = resolveNpmInvocation();
    const cwd = path.join(home, 'runtime');
    const registry = o.registry ?? processResult(npm.command, [...npm.prefixArgs, 'config', 'get', 'registry'], { cwd }).trim();
    const config = npmInstallOptions(['--npm-registry', registry, ...(o.offline ? ['--offline'] : [])]);
    processResult(npm.command, [...npm.prefixArgs, 'ci', ...config.args.slice(1)], { cwd });
    return config.registry;
}
function logWriter(root, id) { const logPath = path.join(root, 'logs', id + '.jsonl'); fs.mkdirSync(path.dirname(logPath), { recursive: true }); const emit = event => fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 }); return { logPath, emit }; }
function atomicJournal(file, value) { const next = file + '.next'; write(next, value); fs.renameSync(next, file); }
function rollback(j, save, hook = () => { }) {
    const results = [];
    for (const op of [...j.ops].reverse()) {
        try {
            hook('rollback', op);
            if (exists(op.backup)) {
                if (exists(op.target)) {
                    const retained = op.target + '.failed-' + j.id;
                    fs.renameSync(op.target, retained);
                    op.failed = retained;
                }
                fs.renameSync(op.backup, op.target);
            }
            else if (!op.hadOriginal && !exists(op.stage) && exists(op.target)) {
                const retained = op.target + '.failed-' + j.id;
                fs.renameSync(op.target, retained);
                op.failed = retained;
            }
            op.restored = true;
            save();
            results.push({ target: op.target, ok: true });
        }
        catch (e) {
            results.push({ target: op.target, ok: false, error: e.message });
        }
    }
    j.rollback = results;
    j.status = results.every(x => x.ok) ? 'rolled_back' : 'recovery_required';
    save();
    return results;
}
function preserveUserFiles(oldHome, newHome, oldManifest) {
    const oldRuntime = path.join(oldHome, 'runtime');
    if (!exists(oldRuntime))
        return;
    // Preserve all untracked runtime files (legacy has no inventory: retain files absent from new package), including config/output/tasks.
    function visit(rel = '') {
        for (const e of fs.readdirSync(path.join(oldRuntime, rel), { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === '.git')
                continue;
            const sub = path.join(rel, e.name);
            const a = path.join(oldRuntime, sub), b = path.join(newHome, 'runtime', sub);
            if (e.isSymbolicLink())
                fail('USER_DATA_LINK', '用户数据包含软链接，需明确迁移: ' + a);
            if (e.isDirectory()) {
                visit(sub);
                continue;
            }
            const tracked = oldManifest.integrity?.['runtime/' + sub.split(path.sep).join('/')];
            const config = /[\\/]config[\\/]local\.json$/.test(a);
            if (config || (!tracked && !exists(b))) {
                fs.mkdirSync(path.dirname(b), { recursive: true });
                fs.copyFileSync(a, b);
            }
            else if (tracked && hash(fs.readFileSync(a)) !== tracked && !config)
                fail('MODIFIED_RUNTIME', '检测到被修改的产品文件，拒绝静默覆盖: ' + a);
        }
    }
    visit();
}
export async function install(root, o = {}, hooks = {}) {
    const id = Date.now() + '-' + crypto.randomBytes(5).toString('hex');
    let loc;
    try {
        loc = locate(o);
    }
    catch (e) {
        return { ok: false, error: { code: e.code ?? 'LOCATION', message: e.message, details: e.details }, currentInstallation: 'not_verified', logPath: null, logUnavailableReason: '无法确定唯一安装根，不擅自选择目录写入日志' };
    }
    const { logPath, emit } = logWriter(loc.stateRoot, id);
    let phase = 'preflight', j, lockAcquired = false;
    const lock = path.join(loc.stateRoot, 'locks', PRODUCT + '.json');
    const journal = path.join(loc.stateRoot, 'transactions', id + '.json');
    const durations = {};
    const stage = async (n, fn) => { phase = n; const start = Date.now(); emit({ phase: n, event: 'start' }); try {
        const v = await fn();
        durations[n] = Date.now() - start;
        emit({ phase: n, event: 'end', durationMs: durations[n] });
        return v;
    }
    catch (e) {
        durations[n] = Date.now() - start;
        emit({ phase: n, event: 'error', durationMs: durations[n], code: e.code ?? 'ERROR', message: e.message });
        throw e;
    } };
    const save = () => atomicJournal(journal, j);
    const unlock = () => { if (lockAcquired) {
        fs.renameSync(lock, lock + '.closed-' + id);
        lockAcquired = false;
    } };
    try {
        const { manifest } = await stage('preflight', () => preflight(root, o));
        if (o.preflight || o['dry-run'])
            return { ok: true, data: { plan: { product: PRODUCT, version: manifest.version, skillTargets: loc.skillTargets, stateRoot: loc.stateRoot } }, logPath, durations };
        await stage('lock', () => { j = { id, status: 'preparing', product: PRODUCT, logPath, ops: [] }; save(); fs.mkdirSync(path.dirname(lock), { recursive: true }); try {
            fs.writeFileSync(lock, JSON.stringify({ id, journal, pid: process.pid }), { flag: 'wx', mode: 0o600 });
            lockAcquired = true;
        }
        catch {
            fail('INSTALL_BUSY', '有安装事务未结束；运行官方check/recover，不删除锁文件');
        } });
        const work = path.join(loc.stateRoot, 'staging', PRODUCT, id);
        const prepared = path.join(work, 'package');
        await stage('stage-source', () => {
            fs.mkdirSync(work, { recursive: true });
            (hooks.copy ?? copyTree)(root, prepared, { recursive: true });
            inspectPackage(prepared);
            if (loc.record) {
                preserveUserFiles(loc.home, prepared, read(path.join(loc.home, 'distribution.json')));
                for (const e of fs.readdirSync(loc.home, { withFileTypes: true })) {
                    if (!exists(path.join(prepared, e.name))) {
                        noLinks(path.join(loc.home, e.name));
                        copyTree(path.join(loc.home, e.name), path.join(prepared, e.name));
                    }
                }
            }
        });
        const registry = await stage('dependencies', () => (hooks.dependencies ?? installDependencies)(prepared, { ...o, registry: o.registry ?? loc.record?.npmRegistry }));
        await stage('runtime-validation', () => (hooks.runtimeCheck ?? runtimeCheck)(prepared));
        const installId = loc.record?.installId ?? crypto.randomUUID();
        const record = { ...loc.record, product: PRODUCT, version: manifest.version, installId, skillTargets: loc.skillTargets, stateTarget: loc.stateRoot, scope: loc.scope, projectDir: loc.projectDir, agent: loc.record?.agent ?? o.agent ?? 'explicit', serverUrl: loc.record?.serverUrl ?? o.serverUrl ?? null, updateCredential: loc.record?.updateCredential ?? o.updateCredential ?? null, npmRegistry: registry, installedAt: new Date().toISOString(), schemaVersion: 2 };
        await stage('stage-skills', () => {
            for (const target of loc.skillTargets)
                for (const s of manifest.skills) {
                    const dest = path.join(target, s.id), staged = dest + '.stage-' + id;
                    fs.mkdirSync(target, { recursive: true });
                    (hooks.copy ?? copyTree)(path.join(prepared, 'skills', s.id), staged, { recursive: true });
                    if (loc.record && exists(dest)) {
                        const oldSkill = read(path.join(loc.home, 'distribution.json')).skills.find(x => x.id === s.id);
                        const tracked = new Set((oldSkill?.files ?? []).map(f => f.path));
                        for (const rel of files(dest)) {
                            if (!tracked.has(rel) && !['.hunter-installation.json', 'scripts/opencli-entry.json'].includes(rel) && !exists(path.join(staged, rel))) {
                                fs.mkdirSync(path.dirname(path.join(staged, rel)), { recursive: true });
                                fs.copyFileSync(path.join(dest, rel), path.join(staged, rel));
                            }
                        }
                    }
                    const pointer = { schemaVersion: 2, product: PRODUCT, stateRoot: loc.stateRoot, installId, entry: path.join(loc.home, 'manage.mjs') };
                    write(path.join(staged, '.hunter-installation.json'), pointer);
                    write(path.join(staged, 'scripts', 'opencli-entry.json'), { entry: path.join(loc.home, 'runtime', 'opencli.mjs') });
                    addOp(staged, dest);
                }
        });
        const receiptStage = path.join(work, 'receipt.json');
        await stage('stage-receipt', () => { hooks.beforeReceiptWrite?.(); write(receiptStage, record); });
        addOp(prepared, loc.home);
        addOp(receiptStage, loc.receiptPath);
        await stage('switch', () => { preflight(root, o); const current = exists(loc.receiptPath) ? read(loc.receiptPath) : null; if (JSON.stringify(current) !== JSON.stringify(loc.record))
            fail('INSTALL_CHANGED', '准备期间回执变化，拒绝切换'); j.status = 'switching'; save(); for (const op of j.ops) {
            hooks.beforeSwitch?.(op, j);
            fs.mkdirSync(path.dirname(op.target), { recursive: true });
            if (op.hadOriginal)
                fs.renameSync(op.target, op.backup);
            op.rotated = true;
            save();
            fs.renameSync(op.stage, op.target);
            op.switched = true;
            save();
        } });
        await stage('verify-installed', () => { hooks.beforeVerify?.(); const result = check(loc, { runtimeCheck: hooks.runtimeCheck, allowPending: true }); if (!result.ok)
            fail('POSTCHECK', '安装后完整性检查失败', result.error); });
        j.status = 'committed';
        save();
        unlock();
        emit({ phase: 'complete', event: 'end' });
        return { ok: true, data: { product: PRODUCT, version: manifest.version, entry: path.join(loc.home, 'manage.mjs'), layers: { A: 'passed', B: 'not_executed', C: 'not_executed' }, backups: j.ops.filter(x => x.hadOriginal).map(x => x.backup) }, logPath, journal, durations };
    }
    catch (e) {
        let results = [];
        const failedPhase = phase;
        if (j && lockAcquired) {
            try {
                results = await stage('rollback', () => rollback(j, save, hooks.rollback));
                if (j.status === 'rolled_back') unlock();
            } catch (recoveryError) {
                j.status = 'recovery_required';
                results.push({ok:false,error:recoveryError.message,phase:'rollback-journal'});
            }
        }
        else
            unlock();
        const current = loc.record ? check(loc, { runtimeCheck: hooks.runtimeCheck }).ok : false;
        return { ok: false, error: { code: e.code ?? 'INSTALL_FAILED', message: e.message, details: e.details, phase: failedPhase }, logPath, journal: j ? journal : null, durations, rollback: results, currentInstallation: current ? 'integrity_passed_business_unverified' : loc.record ? 'not_verified' : 'not_installed', nextAction: j?.status === 'recovery_required' ? '运行manage recover；不要手工删除锁' : '查看日志，修正报告的问题后重跑同一官方入口' };
    }
    function addOp(staged, target) { j.ops.push({ stage: staged, target, backup: target + '.backup-' + id, hadOriginal: exists(target) }); save(); }
}
export function check(loc, { runtimeCheck: validate = runtimeCheck, allowPending = false } = {}) {
    const errors = [];
    const record = exists(loc.receiptPath) ? read(loc.receiptPath) : null;
    let manifest;
    try {
        manifest = read(path.join(loc.home, 'distribution.json'));
        if (!record || record.version !== manifest.version || record.product !== PRODUCT)
            errors.push('产品回执与清单不一致');
        for (const s of manifest.skills ?? [])
            for (const target of loc.skillTargets) {
                const dest = path.join(target, s.id);
                if (!exists(path.join(dest, 'SKILL.md')) || !ownSkill(dest, { ...loc, record }, s.id))
                    errors.push('Skill或指针缺失/冲突: ' + dest);
                else {
                    for (const f of s.files ?? []) {
                        const p = path.join(dest, f.path);
                        if (!exists(p) || hash(fs.readFileSync(p)) !== f.sha256)
                            errors.push('Skill文件被改动: ' + p);
                    }
                }
            }
        for (const [rel, sha] of Object.entries(manifest.integrity ?? {})) {
            const p = path.join(loc.home, rel);
            if (!exists(p) || hash(fs.readFileSync(p)) !== sha)
                errors.push('产品文件缺失/损坏: ' + rel);
        }
    }
    catch (e) {
        errors.push(e.message);
    }
    let runtime;
    try {
        runtime = validate(loc.home);
    }
    catch (e) {
        errors.push(e.message);
    }
    const lock = path.join(loc.stateRoot, 'locks', PRODUCT + '.json');
    if (exists(lock) && !allowPending)
        errors.push('安装事务尚未结束，请检查或恢复');
    return { ok: errors.length === 0, ...(errors.length ? { error: { code: 'INTEGRITY', message: '安装完整性未通过', details: errors } } : { data: { product: PRODUCT, productVersion: record.version, paths: {stateRoot: loc.stateRoot, runtimeRoot: path.join(loc.home,'runtime'), tenantConfig: path.join(loc.home,'runtime/packages/gllue/config/local.json'), skillTargets: loc.skillTargets, scope: loc.scope}, skills: manifest.skills.map(s => ({ id: s.id, version: s.version })), components: manifest.runtime?.packages, opencli: runtime.opencli, layers: { A: 'passed', B: 'not_executed', C: 'not_executed' } } }), pendingTransaction: exists(lock) ? read(lock) : null, entry: path.join(loc.home, 'manage.mjs') };
}
export function recover(o = {}) {
    const loc = locate(o), lock = path.join(loc.stateRoot, 'locks', PRODUCT + '.json');
    if (!exists(lock))
        return { ok: true, data: { message: '没有待恢复事务' } };
    const l = read(lock);
    try {
        process.kill(l.pid, 0);
        fail('INSTALL_RUNNING', '原进程仍存活，拒绝恢复');
    }
    catch (e) {
        if (e.code !== 'ESRCH')
            throw e;
    }
    const j = read(l.journal);
    if (j.product !== PRODUCT || !j.ops.every(op => [loc.home, loc.receiptPath, ...loc.skillTargets.flatMap(t => ['cskh-gllue'].map(s => path.join(t, s)))].includes(op.target)))
        fail('JOURNAL', '恢复日志目标不匹配');
    if (j.status !== 'committed')
        rollback(j, () => atomicJournal(l.journal, j));
    if (['committed', 'rolled_back'].includes(j.status))
        fs.renameSync(lock, lock + '.recovered-' + j.id);
    return { ok: ['committed', 'rolled_back'].includes(j.status), data: { status: j.status, rollback: j.rollback ?? [], logPath: j.logPath }, check: check(loc) };
}
export function output(result) { process.stdout.write(JSON.stringify({ schemaVersion: 1, ...result }) + '\n'); process.exitCode = result.ok ? 0 : 1; }
export function maintenance(loc) { const dir = path.join(loc.stateRoot, 'transactions'); const transactions = exists(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => { try {
    const j = read(path.join(dir, f));
    return { id: j.id, status: j.status, backups: j.ops.filter(x => exists(x.backup)).map(x => x.backup), logPath: j.logPath };
}
catch {
    return { file: f, status: 'unreadable' };
} }) : []; return { ok: true, data: { transactions, policy: '验收后保留最近2次成功安装及最近1次失败证据；清理必须单独授权，本入口只列清单。10次成功安装后暂停继续升级。' } }; }
export function capabilities(loc) { const text = processResult(process.execPath, [path.join(loc.home, 'runtime', 'opencli.mjs'), 'gllue', '--help']); return { ok: true, data: { product: PRODUCT, entry: path.join(loc.home, 'manage.mjs'), commands: text, prerequisites: ['Node.js22+', '配置真实租户', 'Chrome官方扩展连接及租户登录'], layers: { B: 'catalog_read_only_not_new_agent_session', C: 'not_executed' } } }; }
export function run(loc, argv) {
    if (!argv.length)
        fail('ARGUMENT', 'run需要命令参数');
    if (exists(path.join(loc.stateRoot, 'locks', PRODUCT + '.json')))
        fail('INSTALL_BUSY', '安装事务未结束，请先check/recover');
    const r = spawnSync(process.execPath, [path.join(loc.home, 'runtime', 'opencli.mjs'), ...argv], { encoding: 'utf8', shell: false, maxBuffer: 16 * 1024 * 1024, timeout: 180000 });
    let data;
    try {
        data = JSON.parse(r.stdout);
    }
    catch {
        data = { text: r.stdout ?? '' };
    }
    const ok = !r.error && r.status === 0 && data?.ok !== false;
    return { ok, ...(ok ? { data } : { error: { code: r.error?.code ?? 'COMMAND_FAILED', message: r.stderr?.trim() || '命令失败', result: data } }) };
}
