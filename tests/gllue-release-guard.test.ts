import assert from 'node:assert/strict';
import {test} from 'node:test';
// @ts-expect-error Plain ESM release helper has no TypeScript declaration.
import {lockExpectedGllueRelease,validateExpectedRelease} from '../scripts/lib/gllue-release-guard.mjs';
const id='fefc1dff-a2ac-4cc3-b748-50849c71c8b5',sha='a'.repeat(64);
test('release guard refuses missing approval identities before database access',()=>{
 assert.throws(()=>validateExpectedRelease(null,sha));assert.throws(()=>validateExpectedRelease(id,'wrong'));
});
test('release guard locks existing product then accepts only exact current identity',async()=>{
 const calls:string[]=[];
 const client={query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('FROM products')?[{id:'product',is_public:true}]:sql.includes('FROM releases')?[{id,package_sha256:sha}]:[]};}};
 assert.equal(await lockExpectedGllueRelease(client,id,sha),'product');
 assert.equal(calls.length,4);assert.equal(calls[0],"SET LOCAL lock_timeout = '5s'");assert.equal(calls[1],'LOCK TABLE releases IN SHARE ROW EXCLUSIVE MODE');assert.ok(calls.slice(2).every(s=>s.endsWith('FOR UPDATE')));
});
test('changed, missing, or ambiguous current release rejects before any mutation',async()=>{
 for(const active of [[],[{id:'other',package_sha256:sha}],[{id,package_sha256:'b'.repeat(64)}],[{id,package_sha256:sha},{id,package_sha256:sha}]]){
  const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('FROM products')?[{id:'product',is_public:true}]:sql.includes('FROM releases')?active:[]};}};
  await assert.rejects(lockExpectedGllueRelease(client,id,sha),/Current release changed/);
  assert.ok(calls.every(s=>/^(SELECT|SET LOCAL|LOCK TABLE)/.test(s)));
 }
});
test('missing or private product is not created or made public',async()=>{
 for(const products of [[],[{id:'product',is_public:false}]]){
  const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);return {rows:products};}};
  await assert.rejects(lockExpectedGllueRelease(client,id,sha),/existing public/);assert.equal(calls.length,3);
 }
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
test('rollback CLI refuses changed baseline or corrupt old package and records successful rollback atomically',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gllue-rollback-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const target='09282e02-5b53-423a-8d8d-86ac2e1c4dc9',key='gllue-only/0.2.2/gllue-only-v0.2.2.tar.gz';
 const bytes=Buffer.from('synthetic rollback package'),targetSha=crypto.createHash('sha256').update(bytes).digest('hex');
 fs.mkdirSync(path.dirname(path.join(dir,key)),{recursive:true});fs.writeFileSync(path.join(dir,key),bytes);
 const mock=path.join(dir,'pg.mjs'),loader=path.join(dir,'loader.mjs'),log=path.join(dir,'queries.jsonl');
 fs.writeFileSync(mock,`import fs from 'node:fs';class Client {async connect(){} async end(){} async query(sql,args){fs.appendFileSync(process.env.TEST_QUERY_LOG,JSON.stringify({sql,args})+'\\n');if(sql.includes('FROM products'))return {rows:[{id:'product',is_public:true}]};if(sql.includes('AND is_published FOR UPDATE'))return {rows:[{id:process.env.TEST_CURRENT_ID,package_sha256:'${sha}'}]};if(sql.includes('SELECT id, version, package_key'))return {rows:[{id:'${target}',version:'0.2.2',package_key:'${key}',package_sha256:'${targetSha}'}]};if(sql.includes('FROM users'))return {rows:[{id:'admin'}]};return {rows:[]};}}export default {Client};`);
 fs.writeFileSync(loader,`export async function resolve(s,c,n){if(s==='pg')return {url:${JSON.stringify(new URL('file://'+mock).href)},shortCircuit:true};return n(s,c);}`);
 const run=(current:string)=>{fs.writeFileSync(log,'');const r=spawnSync(process.execPath,['--experimental-loader',loader,'scripts/rollback-gllue-release.mjs','--expected-current-release-id',id,'--expected-current-sha256',sha,'--restore-release-id',target,'--restore-sha256',targetSha],{encoding:'utf8',env:{...process.env,DATABASE_URL:'synthetic',PACKAGE_STORAGE_DIR:dir,TEST_QUERY_LOG:log,TEST_CURRENT_ID:current}});return {r,queries:fs.readFileSync(log,'utf8').trim().split('\n').map(line=>JSON.parse(line) as {sql:string})};};
 const stale=run(target);assert.notEqual(stale.r.status,0);assert.ok(!stale.queries.some(q=>/^(UPDATE|INSERT)/.test(q.sql)));assert.ok(stale.queries.some(q=>q.sql==='ROLLBACK'));
 fs.writeFileSync(path.join(dir,key),'corrupt');const corrupt=run(id);assert.notEqual(corrupt.r.status,0);assert.ok(!corrupt.queries.some(q=>/^(UPDATE|INSERT)/.test(q.sql)));
 fs.writeFileSync(path.join(dir,key),bytes);const good=run(id);assert.equal(good.r.status,0,good.r.stderr);assert.equal(JSON.parse(good.r.stdout).restored,true);assert.equal(good.queries.filter(q=>q.sql.startsWith('UPDATE')).length,2);assert.ok(good.queries.some(q=>q.sql.startsWith('INSERT INTO admin_audit_log')));assert.equal(good.queries.at(-1)?.sql,'COMMIT');
});
