import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, check, locate, preflight, hash, copyTree } from '../template/lifecycle.mjs';
import { newer, acquire } from '../template/remote.mjs';
import http from 'node:http';
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gllue-lifecycle-tests-'));
const template = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../template');
const put = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v)); };
function pkg(version = '1.3.2-rc.3') {
    const root = fs.mkdtempSync(path.join(base, 'source-'));
    fs.cpSync(template, root, { recursive: true });
    for (const f of ['package.json', 'package-lock.json', 'packages/gllue/package.json'])
        put(path.join(root, 'runtime', f), {});
    for (const f of ['opencli.mjs', 'run-opencli.mjs'])
        put(path.join(root, 'runtime', f), '//fixture');
    put(path.join(root, 'skills/cskh-gllue/SKILL.md'), '---\nname: cskh-gllue\n---\n');
    put(path.join(root, 'skills/cskh-gllue/scripts/manage.mjs'), '// fixture');
    const manifest = { product: 'gllue-only', version, requirements: { opencli: '2.0.2' }, skills: [{ id: 'cskh-gllue', version: '1.3.0', files: [{ path: 'SKILL.md', sha256: hash(fs.readFileSync(path.join(root, 'skills/cskh-gllue/SKILL.md'))) }] }], integrity: {} };
    function walk(dir, rel = '') { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = rel + e.name;
        if (e.isDirectory())
            walk(path.join(dir, e.name), r + '/');
        else
            manifest.integrity[r] = hash(fs.readFileSync(path.join(dir, e.name)));
    } }
    walk(root);
    put(path.join(root, 'distribution.json'), manifest);
    return root;
}
const hooks = { dependencies: () => 'https://registry.npmjs.org/', runtimeCheck: () => ({ opencli: '2.0.2' }) };
function opts() { const p = fs.mkdtempSync(path.join(base, '安装 空间-')); return { stateRoot: path.join(p, 'state'), skillTargets: [path.join(p, 'workbuddy'), path.join(p, 'codex')], scope: 'user' }; }
function snapshot(o) { const l = locate(o); return { receipt: fs.readFileSync(l.receiptPath, 'utf8'), manifest: fs.readFileSync(path.join(l.home, 'distribution.json'), 'utf8'), skills: l.skillTargets.map(t => fs.readFileSync(path.join(t, 'cskh-gllue/.hunter-installation.json'), 'utf8')) }; }
test('新装、多目标、版本分层及原目录升级，保留配置和任务', async () => { const o = opts(); assert.equal((await install(pkg('1.3.1'), o, hooks)).ok, true); let l = locate(o); put(path.join(l.home, 'runtime/packages/gllue/config/local.json'), { tenant: 'test' }); put(path.join(l.home, 'runtime/output/task.json'), { task: 'retained' }); put(path.join(o.stateRoot, 'tasks/private.json'), { kept: true }); put(path.join(o.skillTargets[0], 'cskh-gllue/tasks/retained.json'), { kept: true }); const r = await install(pkg(), { stateRoot: o.stateRoot }, hooks); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.data.backups.length, 4); l = locate({ stateRoot: o.stateRoot }); assert.deepEqual(l.skillTargets, o.skillTargets); assert.equal(l.scope, 'user'); assert.ok(fs.existsSync(path.join(o.skillTargets[0], 'cskh-gllue/tasks/retained.json'))); assert.equal(JSON.parse(fs.readFileSync(path.join(l.home, 'runtime/output/task.json'))).task, 'retained'); assert.equal(check(l, { runtimeCheck: hooks.runtimeCheck }).data.productVersion, '1.3.2-rc.3'); assert.equal(check(l, { runtimeCheck: hooks.runtimeCheck }).data.skills[0].version, '1.3.0'); assert.ok(fs.existsSync(path.join(o.stateRoot, 'tasks/private.json'))); });
test('预检一次报告缺文件和同名目录冲突，旧安装不变', async () => { const o = opts(), source = pkg(); put(path.join(o.skillTargets[0], 'cskh-gllue/SKILL.md'), '---\nname: cskh-gllue\n---'); fs.renameSync(path.join(source, 'runtime/opencli.mjs'), path.join(source, 'missing.mjs')); assert.throws(() => preflight(source, o), e => e.details.some(x => x.includes('缺文件')) && e.details.some(x => x.includes('归属'))); assert.equal(fs.existsSync(path.join(o.stateRoot, 'packages/gllue-only')), false); });
test('目标或回执/指针冲突拒绝，不猜路径', async () => { const o = opts(); await install(pkg(), o, hooks); assert.throws(() => locate({ ...o, skillTargets: [o.skillTargets[0]] }), /不能变更/); const pointer = path.join(o.skillTargets[0], 'cskh-gllue/.hunter-installation.json'); const p = JSON.parse(fs.readFileSync(pointer)); p.installId = 'wrong'; put(pointer, p); assert.throws(() => locate({ pointer }), /不一致/); });
for (const failure of ['copy', 'dependencies', 'skill-switch', 'runtime-switch', 'receipt-switch', 'postcheck'])
    test(failure + '失败完整回退', async () => { const o = opts(); assert.equal((await install(pkg('1.3.1'), o, hooks)).ok, true); const before = snapshot(o); let once = false; const h = { ...hooks }; if (failure === 'copy')
        h.copy = () => { throw new Error('copy failed'); }; if (failure === 'dependencies')
        h.dependencies = () => { throw new Error('npm failed'); }; if (failure.endsWith('-switch'))
        h.beforeSwitch = op => { if (!once && ((failure === 'skill-switch' && op.target === path.join(o.skillTargets[1], 'cskh-gllue')) || (failure === 'runtime-switch' && op.target.endsWith(path.join('packages','gllue-only'))) || (failure === 'receipt-switch' && op.target.endsWith(path.join('installations','gllue-only.json'))))) {
            once = true;
            throw new Error(failure);
        } }; if (failure === 'postcheck')
        h.beforeVerify = () => { throw new Error('postcheck'); }; const r = await install(pkg(), { stateRoot: o.stateRoot }, h); assert.equal(r.ok, false); assert.deepEqual(snapshot(o), before); assert.equal(r.currentInstallation, 'integrity_passed_business_unverified'); assert.ok(fs.readFileSync(r.logPath, 'utf8').includes('error')); });
test('回退失败保留锁及实际结果', async () => { const o = opts(); await install(pkg('1.3.1'), o, hooks); const r = await install(pkg(), { stateRoot: o.stateRoot }, { ...hooks, beforeVerify: () => { throw new Error('fail'); }, rollback: () => { throw new Error('locked'); } }); assert.equal(r.ok, false); assert.ok(r.rollback.every(x => !x.ok)); assert.ok(fs.existsSync(path.join(o.stateRoot, 'locks/gllue-only.json'))); });
test('禁止force覆盖未知Skill', async () => { const o = opts(); put(path.join(o.skillTargets[1], 'cskh-gllue/SKILL.md'), '---\nname: cskh-gllue\n---'); const r = await install(pkg(), { ...o, force: true }, hooks); assert.equal(r.ok, false); });
test('产品版本必须匹配清单', async () => { const o = opts(); const r = await install(pkg(), { ...o, version: '1.3.0' }, hooks); assert.equal(r.ok, false); });
test('semver 正式版和rc排序正确', () => { assert.equal(newer('1.3.2', '1.3.2-rc.3'), true); assert.equal(newer('1.3.2-rc.10', '1.3.2-rc.3'), true); assert.equal(newer('1.3.1', '1.3.2-rc.3'), false); });
test('下载SHA缺失/错误拒绝并留下日志', async () => { const server = http.createServer((q, r) => r.end('bad package')); await new Promise(r => server.listen(0, '127.0.0.1', r)); try {
    for (const sha of [undefined, '0'.repeat(64)])
        await assert.rejects(acquire('http://127.0.0.1:' + server.address().port, sha, base), e => ['HASH_REQUIRED', 'HASH_MISMATCH'].includes(e.code) && fs.existsSync(e.logPath));
}
finally {
    server.close();
} });
test('回执写入失败恢复全部预备目标', async () => { const o = opts(); await install(pkg('1.3.1'), o, hooks); const before = snapshot(o); const r = await install(pkg(), { stateRoot: o.stateRoot }, { ...hooks, beforeReceiptWrite: () => { throw new Error('EACCES receipt'); } }); assert.equal(r.error.phase, 'stage-receipt'); assert.deepEqual(snapshot(o), before); });
test('并发锁拒绝，不能误回退另一安装', async () => { const o = opts(); await install(pkg(), o, hooks); put(path.join(o.stateRoot, 'locks/gllue-only.json'), { pid: process.pid, journal: 'other' }); const before = snapshot(o); const r = await install(pkg(), o, hooks); assert.equal(r.error.code, 'INSTALL_BUSY'); assert.deepEqual(snapshot(o), before); assert.equal(JSON.parse(fs.readFileSync(path.join(o.stateRoot, 'locks/gllue-only.json'))).journal, 'other'); });
test('check检出安装指针entry篡改', async () => { const o = opts(); await install(pkg(), o, hooks); const pointer = path.join(o.skillTargets[0], 'cskh-gllue/.hunter-installation.json'); const v = JSON.parse(fs.readFileSync(pointer)); v.entry = '/wrong'; put(pointer, v); assert.equal(check(locate(o), { runtimeCheck: hooks.runtimeCheck }).ok, false); });
test('旧运行时指针定位回执，不猜安装路径', async()=>{const o=opts();await install(pkg(),o,hooks);const legacy=path.join(o.skillTargets[0],'cskh-gllue/scripts/opencli-entry.json');assert.equal(locate({pointer:legacy}).stateRoot,o.stateRoot);assert.throws(()=>locate({pointer:legacy,stateRoot:o.stateRoot+'-other'}),/不一致/);});

test('tree copy preserves Unicode destination and file bytes', () => {
 const source = fs.mkdtempSync(path.join(base, 'unicode-source-'));
 const destination = path.join(base, '新装 暂存', 'package');
 put(path.join(source, '子目录', '配置.json'), '{"tenant":"测试"}');
 copyTree(source, destination);
 assert.equal(fs.readFileSync(path.join(destination, '子目录', '配置.json'), 'utf8'), '{"tenant":"测试"}');
});
