import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {getRegistry} from '@jackwener/opencli/registry';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ordinary-scout-integration-'));
process.env.HUNTER_DATA_DIR=root;
fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({linkedin:{tier:'premium_business'}}));
await import('../scout.js');
const command=getRegistry().get('hunter-linkedin/scout');
const args={keyword:'engineer',location:'',connection:'',currentCompany:'',pastCompany:'',school:'',industry:'',language:'',limit:30,skipTierCheck:true,output:path.join(root,'results.json')};
function browser({blockedPage,session='synthetic-session'}={}){
 let url='',pages=[];const calls={goto:[],evaluate:0,cookies:0};
 return {calls,goto:async value=>{url=value;calls.goto.push(value);},getCookies:async()=>{calls.cookies++;return [{name:'li_at',value:session}];},evaluate:async script=>{
  calls.evaluate++;
  assert.equal(typeof script,'function','normal paging uses the combined DOM reader');
  const n=Number(new URL(url).searchParams.get('page')||1);
  return {url,results:Array.from({length:20},(_,i)=>({profileId:'p'+((n-1)*20+i),profileUrl:'https://www.linkedin.com/in/p'+((n-1)*20+i)+'/',rawName:'Fixture Person • 2nd Engineer Singapore'})),blocked:n===blockedPage,pagination:{nextExists:true,nextEnabled:n<3,selectedPage:n},scroll:{top:0,height:100,total:100},loading:false};
 }};
}
test('real registered scout traverses pages, reports real page count and resumes the half page',async()=>{
 assert.equal(command.navigateBefore,false);
 const firstPage=browser();const first=await command.func(firstPage,args);
 assert.equal(first.candidates.length,30);assert.equal(first.meta.pagesViewed,2);assert.equal(first.pagination.scroll_rounds,0);assert.equal(first.stop_reason,'result_limit');assert.ok(first.cursor);assert.equal(firstPage.calls.goto.length,2);
 const nextPage=browser();const next=await command.func(nextPage,{...args,limit:60,cursor:first.cursor});
 assert.equal(next.candidates.length,60);assert.equal(next.new_count,30);assert.equal(nextPage.calls.goto.length,2);assert.match(nextPage.calls.goto[0],/page=2/);assert.equal(next.completeness,'complete');
 await assert.rejects(command.func(browser({session:'different-account'}),{...args,limit:60,cursor:first.cursor}),{code:'search_cursor_account_mismatch'});
});
test('ordinary collector does not silently clamp requested amount to old tier reference',async()=>{
 const page=browser();const result=await command.func(page,{...args,limit:200});
 assert.equal(result.meta.requestedLimit,200);assert.equal(result.meta.searchParams.limit,200);assert.equal(result.candidates.length,60);assert.equal(result.stop_reason,'results_exhausted');assert.equal(result.meta.pagesViewed,3);
});
test('platform restriction after a page preserves partial results and stops',async()=>{
 const page=browser({blockedPage:2});const result=await command.func(page,{...args,limit:60});
 assert.equal(result.returned_count,20);assert.equal(result.interruption.code,'search_restricted');assert.equal(result.cursor,null);assert.equal(page.calls.goto.length,2);
});
test.after(()=>{fs.rmSync(root,{recursive:true,force:true});});

test('invalid page limit fails before browser or cookie access',async()=>{
 const page=browser();await assert.rejects(command.func(page,{...args,maxPages:0}),{code:'invalid_page_limit'});assert.equal(page.calls.goto.length,0);assert.equal(page.calls.cookies,0);
});

test('failed cursor persistence keeps the observed people and marks interruption',async()=>{
 const cursorRoot=path.join(root,'channels','linkedin','search-cursors'),backup=cursorRoot+'-saved';
 fs.renameSync(cursorRoot,backup);fs.writeFileSync(cursorRoot,'synthetic obstruction');
 try{
  const result=await command.func(browser(),args);
  assert.equal(result.returned_count,20);assert.equal(result.cursor,null);assert.equal(result.interruption.code,'checkpoint_write_failed');
 }finally{fs.unlinkSync(cursorRoot);fs.renameSync(backup,cursorRoot);}
});

test('registered scout reports keyword expansion and rejects invalid IDs before browser access',async()=>{
 const page=browser();const result=await command.func(page,{...args,location:'Singapore',industry:'Software',language:'English',limit:1});
 for(const field of ['location','industry','language'])assert.equal(result.filter_contract.applications.find(v=>v.field===field).method,'keyword_expansion');
 const invalid=browser();await assert.rejects(command.func(invalid,{...args,currentCompany:'123,Acme'}),{code:'invalid_currentCompany_ids'});assert.equal(invalid.calls.cookies,0);assert.equal(invalid.calls.goto.length,0);
});
