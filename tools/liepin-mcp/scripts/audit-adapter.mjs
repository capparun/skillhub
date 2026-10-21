// Offline contract audit against the installed official package. No Chrome calls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=fs.realpathSync(process.argv[2]??'');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
assert.equal(manifest.name,'opencli-mcp');assert.equal(manifest.version,'0.0.30','Reaudit upstream before changing the supported contract');
const {SiteRegistry}=await import(pathToFileURL(path.join(root,'dist/src/sites/loader.js')));
const {runAdapter}=await import(pathToFileURL(path.join(root,'dist/src/sites/executor.js')));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hunter-adapter-audit-'));
try {
 fs.mkdirSync(path.join(temp,'liepin'));
 fs.writeFileSync(path.join(temp,'helper.mjs'),"export const value='local-module-imported';");
 fs.writeFileSync(path.join(temp,'liepin/probe.js'),`import {defineAdapter} from ${JSON.stringify(pathToFileURL(path.join(root,'adapter-sdk/index.js')).href)};import {value} from '../helper.mjs';export default defineAdapter({description:'Offline synthetic probe',access:'read',run:async()=>({value})});`);
 const registry=new SiteRegistry([{dir:temp,kind:'user'}]);
 const command=await registry.resolve('liepin','probe');
 const events=[];
 const provider={browserAvailable:()=>true,getAdapterPage:async()=>{events.push('provision-tab');return {};},toolContext:async()=>({tab:{id:'synthetic'},sites:{},recon:{}})};
 const loaded=await runAdapter(provider,command,{});
 assert.equal(loaded.ok,true);assert.equal(loaded.value.value,'local-module-imported');assert.deepEqual(events,['provision-tab']);
 let release,finished=false;
 const delayed={...command,run:()=>new Promise(r=>release=()=>{finished=true;r({done:true});})};
 const timeout=await runAdapter(provider,delayed,{}, {timeoutMs:5});
 assert.equal(timeout.error.code,'command_outcome_unknown');assert.equal(finished,false);release();await Promise.resolve();assert.equal(finished,true);
 const controller=new AbortController();let begin;const entered=new Promise(r=>begin=r);
 const cancelRun=runAdapter(provider,{...command,run:()=>{begin();return new Promise(r=>release=()=>r({late:true}));}},{},{signal:controller.signal});
 await entered;controller.abort();const cancelled=await cancelRun;assert.equal(cancelled.error.code,'command_outcome_unknown');release();
 const sdk=fs.readFileSync(path.join(root,'adapter-sdk/index.d.ts'),'utf8');
 const tab=sdk.split('export interface Tab {')[1].split('export interface Sites')[0];
 const result={package:manifest.name,version:manifest.version,browserAccessed:false,checks:{officialLoaderAndLocalImports:true,executorProvisionsTabBeforeRun:true,timeoutDoesNotStopWork:true,cancellationDoesNotStopWork:true},publicTabContract:{close:/\bclose\s*\(/.test(tab),cdp:/\bcdp\b/.test(tab),evaluate:/\bevaluate\s*\(/.test(tab)},conclusion:'Site adapters support browser business entrypoints, but offline tasks need a local entrypoint and multi-tab lifecycle requires an explicitly supported bridge. Timeout/cancel must be handled inside business execution.'};
 console.log(JSON.stringify(result,null,2));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
