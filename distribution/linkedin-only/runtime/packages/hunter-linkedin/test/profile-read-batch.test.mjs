import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runProfileBatch} from '../profile-read-batch.js';

const url=id=>`https://www.linkedin.com/in/${id}/`;
const row=id=>({profile_url:url(id),name:`Person ${id}`,headline:'Teacher',location:'',about:'About text',experience:'Experience text',education:'Education text',services:'',featured:''});
function fakePage({fatalAt, unreadable=new Set()}={}){
 const calls={goto:[],wait:[],scroll:[],evaluate:[]};
 return {calls,goto:async u=>{calls.goto.push(u);},wait:async s=>{calls.wait.push(s);},autoScroll:async o=>{calls.scroll.push(o);},
  evaluate:async script=>{calls.evaluate.push(script);
   const current=calls.goto.at(-1);
   if(String(script).includes('nameReady'))return {nameReady:true,sections:'111',loading:false};
   if(String(script).includes('document.title'))return fatalAt&&current.endsWith(`/in/${fatalAt}/`)?{url:`${current}login`,title:'LinkedIn Login'}:{url:current,title:'LinkedIn'};
   const id=current.match(/\/in\/([^/]+)\//)?.[1];
   return unreadable.has(id)?{...row(id),name:''}:row(id);
  }};
}
test('reads several profiles sequentially in one page session and writes a checkpoint',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const page=fakePage();
 const {rows,summary}=await runProfileBatch({page,urls:[url('a'),url('b'),url('c')],outputDir:dir,waitSeconds:0});
 assert.deepEqual(page.calls.goto,[url('a'),url('b'),url('c')]);
 assert.equal(rows.length,3);
 assert.equal(rows[1].name,'Person b');
 assert.equal(summary.read_ok,3);
 const lines=readFileSync(join(dir,'checkpoint.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(lines.map(l=>l.status),['ok','ok','ok']);
 assert.equal(existsSync(join(dir,'summary.json')),true);
 assert.deepEqual(page.calls.wait,[0.5,0.5,0.5]);
 assert.equal(page.calls.scroll[0].times,2);
});
test('resume skips profiles already in the checkpoint',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-resume-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'checkpoint.jsonl'),JSON.stringify({profile_url:url('a'),status:'ok'})+'\n');
 const page=fakePage();
 const {rows,summary}=await runProfileBatch({page,urls:[url('a'),url('b')],outputDir:dir,waitSeconds:0});
 assert.deepEqual(page.calls.goto,[url('b')]);
 assert.equal(rows.length,1);
 assert.equal(summary.resumed_from_checkpoint,1);
});
test('a failed profile is recorded without dropping the rest of the batch',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-fail-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const page=fakePage({unreadable:new Set(['b'])});
 const {rows,summary}=await runProfileBatch({page,urls:[url('a'),url('b'),url('c')],outputDir:dir,waitSeconds:0});
 assert.deepEqual(rows.map(r=>r.name),['Person a','Person c']);
 assert.equal(summary.read_ok,2);
 const lines=readFileSync(join(dir,'checkpoint.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(lines.map(l=>l.status),['ok','failed','ok']);
 assert.equal(lines[1].error,'profile_unreadable');
});
test('login pages stop the batch instead of retrying',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-login-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const page=fakePage({fatalAt:'b'});
 const {rows,summary}=await runProfileBatch({page,urls:[url('a'),url('b'),url('c')],outputDir:dir,waitSeconds:0});
 assert.equal(rows.length,1);
 assert.equal(summary.stopped,'not_logged_in');
 assert.deepEqual(page.calls.goto,[url('a'),url('b')]);
});
test('non profile URLs are rejected before any navigation',async()=>{
 await assert.rejects(runProfileBatch({page:fakePage(),urls:['https://www.linkedin.com/feed/'],outputDir:tmpdir(),waitSeconds:0}),{code:'invalid_profile_url'});
});
