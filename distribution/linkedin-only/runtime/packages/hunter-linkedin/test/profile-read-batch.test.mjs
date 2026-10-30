import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runProfileBatch, readProfileFromPage} from '../profile-read-batch.js';
import {anchorSectionUrl, experienceText, normalizeEducationRows} from '../lib/anchor-sections.js';
import {PACING_PRESETS, createPacer} from '../lib/pacing.js';

const url=id=>`https://www.linkedin.com/in/${id}/`;
const row=id=>({profile_url:url(id),name:`Person ${id}`,headline:'Teacher',location:'Sichuan, China',about:'About text',experience:'Experience text',education:'Education text',services:'',featured:''});
const readRow=async value=>row(value.split('/in/')[1].replace(/\//g,''));

function fakePage({fatalAt}={}){
 const calls={goto:[],wait:[],scroll:[],evaluate:[]};
 return {calls,goto:async u=>{calls.goto.push(u);},wait:async s=>{calls.wait.push(s);},autoScroll:async o=>{calls.scroll.push(o);},
  evaluate:async script=>{
   calls.evaluate.push(script);
   const current=calls.goto.at(-1)??'';
   if(String(script).includes('nameReady'))return {nameReady:true,sections:'111',loading:false};
   if(String(script).includes('education_rows')){
    const id=current.match(/\/in\/([^/]+)\//)?.[1]??'';
    return {education_rows:[{rank:1,school:`School ${id}`,degree:'MA',date_range:'2010 – 2012',start_date:'2010',end_date:'2012',description:'',raw_text:`School ${id} | MA`}],section_text:`School ${id} | MA`};
   }
   if(String(script).includes('document.title'))return fatalAt&&current.endsWith(`/in/${fatalAt}/`)?{url:`${current}login`,title:'LinkedIn Login'}:{url:current,title:'LinkedIn'};
   const id=current.match(/\/in\/([^/]+)\//)?.[1];
   return row(id);
  }};
}
test('reads several profiles sequentially through one page session and writes a checkpoint',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const page=fakePage();
 const {rows,summary}=await runProfileBatch({page,urls:[url('a'),url('b'),url('c')],outputDir:dir,waitSeconds:0});
 const edu=id=>`https://www.linkedin.com/in/${id}/details/education/`;
 assert.deepEqual(page.calls.goto,[url('a'),edu('a'),url('b'),edu('b'),url('c'),edu('c')]);
 assert.equal(rows.length,3);
 assert.equal(rows[1].name,'Person b');
 assert.equal(rows[1].education,'School b | MA');
 assert.equal(rows[1].education_items[0].school,'School b');
 assert.equal(summary.read_ok,3);
 assert.equal(summary.results_total,3);
 const lines=readFileSync(join(dir,'checkpoint.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(lines.map(l=>l.status),['ok','ok','ok']);
 assert.equal(existsSync(join(dir,'summary.json')),true);
 assert.equal(page.calls.scroll.length,0);
});
test('the installed profile-read command is used when provided',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-command-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const calls=[];
 const result=await runProfileBatch({urls:[url('a'),url('b')],outputDir:dir,readProfile:async target=>{calls.push(target);return readRow(target);}});
 assert.deepEqual(calls,[url('a'),url('b')]);
 assert.equal(result.rows[1].location,'Sichuan, China');
});
test('resume skips profiles already in the checkpoint',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-resume-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'checkpoint.jsonl'),JSON.stringify({profile_url:url('a'),status:'ok'})+'\n');
 const {rows,summary}=await runProfileBatch({urls:[url('a'),url('b')],outputDir:dir,readProfile:readRow});
 assert.equal(rows.length,1);
 assert.equal(summary.resumed_from_checkpoint,1);
});
test('resume keeps profile rows that were written before',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-merge-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 writeFileSync(join(dir,'profiles.json'),JSON.stringify([row('a')],null,2)+'\n');
 writeFileSync(join(dir,'checkpoint.jsonl'),JSON.stringify({profile_url:url('a'),status:'ok'})+'\n');
 const result=await runProfileBatch({urls:[url('a'),url('b')],outputDir:dir,readProfile:readRow});
 assert.equal(result.profiles.length,2);
 assert.deepEqual(result.profiles.map(r=>r.name),['Person a','Person b']);
 assert.equal(result.summary.read_ok,1);
});
test('a failed profile is recorded without dropping the rest of the batch',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-fail-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const readProfile=async target=>{if(target===url('b'))throw Object.assign(new Error('profile_unreadable'),{code:'profile_unreadable'});return readRow(target);};
 const {rows,summary}=await runProfileBatch({urls:[url('a'),url('b'),url('c')],outputDir:dir,readProfile});
 assert.deepEqual(rows.map(r=>r.name),['Person a','Person c']);
 assert.equal(summary.read_ok,2);
 const lines=readFileSync(join(dir,'checkpoint.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(lines.map(l=>l.status),['ok','failed','ok']);
 assert.equal(lines[1].error,'profile_unreadable');
 assert.equal(lines[1].error_message,'profile_unreadable');
});
test('login failures stop the batch instead of retrying',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-login-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const calls=[];
 const readProfile=async target=>{calls.push(target);if(target===url('b'))throw Object.assign(new Error('not_logged_in'),{code:'not_logged_in'});return readRow(target);};
 const {rows,summary}=await runProfileBatch({urls:[url('a'),url('b'),url('c')],outputDir:dir,readProfile});
 assert.equal(rows.length,1);
 assert.equal(summary.stopped,'not_logged_in');
 assert.deepEqual(calls,[url('a'),url('b')]);
});
test('non profile URLs are rejected before any navigation',async()=>{
 await assert.rejects(runProfileBatch({page:fakePage(),urls:['https://www.linkedin.com/feed/'],outputDir:tmpdir(),waitSeconds:0}),{code:'invalid_profile_url'});
});
test('experience is read through the bundled profile-experience command',async()=>{
 const seen=[];
 const command={func:async(page,args)=>{seen.push(args['profile-url']);return [{title:'Teacher',company:'Springfield School',date_range:'2015 – 2020',location:'Chengdu'}];}};
 const result=await readProfileFromPage(fakePage(),url('a'),0,{getCommand:name=>name==='linkedin/profile-experience'?command:undefined});
 assert.deepEqual(seen,[url('a')]);
 assert.equal(result.experience,'Teacher @ Springfield School (2015 – 2020)');
 assert.equal(result.experience_items[0].company,'Springfield School');
});
test('pacing inserts jittered gaps, group pauses and rests',()=>{
 const steady=PACING_PRESETS.steady;
 const pacer=createPacer({preset:'steady',random:()=>0.5});
 const kinds=[];
 for(let index=1;index<=30;index++){
  const wait=pacer.delayBefore(index);kinds.push(wait.kind);
  assert.ok(wait.ms>=steady.gapMs[0]);
 }
 assert.equal(pacer.delayBefore(0).ms,0);
 assert.equal(kinds.filter(kind=>kind==='gap').length>0,true);
 assert.equal(kinds.includes('group_pause'),true);
 assert.equal(kinds.includes('rest'),true);
});
test('AUTH_REQUIRED stops the batch immediately',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-auth-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const calls=[];
 const readProfile=async target=>{calls.push(target);if(target===url('b'))throw Object.assign(new Error('AUTH_REQUIRED'),{code:'AUTH_REQUIRED'});return readRow(target);};
 const {summary}=await runProfileBatch({urls:[url('a'),url('b'),url('c')],outputDir:dir,readProfile});
 assert.equal(summary.stopped,'AUTH_REQUIRED');
 assert.deepEqual(calls,[url('a'),url('b')]);
});
test('the batch waits between profiles according to the pacer',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-pacing-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const waits=[];
 const pacer={delayBefore:index=>index===0?{ms:0,kind:'none'}:(index===3?{ms:120000,kind:'rest'}:{ms:30000+index,kind:'gap'})};
 const {rows}=await runProfileBatch({urls:['a','b','c','d'].map(url),outputDir:dir,readProfile:readRow,pacer,sleep:async ms=>{waits.push(ms);}});
 assert.equal(rows.length,4);
 assert.deepEqual(waits,[30001,30002,120000]);
});
test('the time budget stops before a pause that would overrun the command timeout',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'profile-batch-budget-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let clock=0;
 const pacer={delayBefore:index=>index===0?{ms:0,kind:'none'}:{ms:40000,kind:'gap'}};
 const readProfile=async target=>{clock+=35000;return readRow(target);};
 const {rows,summary}=await runProfileBatch({urls:['a','b','c','d'].map(url),outputDir:dir,readProfile,pacer,sleep:async ms=>{clock+=ms;},budgetMs:150000,now:()=>clock});
 assert.deepEqual(rows.map(r=>r.name),['Person a','Person b']);
 assert.equal(summary.stopped,'time_budget');
 assert.equal(summary.remaining_after_run,2);
 const lines=readFileSync(join(dir,'checkpoint.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(lines.map(l=>l.status),['ok','ok']);
});
test('education anchors and rows are normalized without scrolling',()=>{
 assert.equal(anchorSectionUrl(url('a'),'education'),'https://www.linkedin.com/in/a/details/education/');
 assert.throws(()=>anchorSectionUrl('https://www.linkedin.com/in/me/','education'),{code:'anchor_requires_profile_url'});
 const parsed=normalizeEducationRows({education_rows:[
  {rank:1,school:' Sichuan University ',degree:'MA',date_range:'2010 – 2012',description:'Thesis'},
  {rank:2,school:'',degree:'BA'},
 ],section_text:'Sichuan University | MA'});
 assert.equal(parsed.items.length,1);
 assert.equal(parsed.items[0].school,'Sichuan University');
 assert.equal(parsed.text,'Sichuan University | MA');
 assert.equal(experienceText([{title:'Teacher',company:'School',date_range:'2015 – 2020'}]),'Teacher @ School (2015 – 2020)');
});
