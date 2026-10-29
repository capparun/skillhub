import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOrdinarySearch,queryKey,pageURL} from '../lib/ordinary-search-collector.js';
const url='https://www.linkedin.com/search/results/people/?keywords=engineer&origin=GLOBAL_SEARCH_HEADER';
const row=id=>({profileId:String(id),profileUrl:`https://www.linkedin.com/in/${id}/`,rawName:'Fixture • 2nd Engineer'});
function fixture(pages,{change,noResults=false,blocked=false}={}){
 let current=1,time=0;const calls={navigate:[],read:0,sleep:[]};
 return {calls,config:{searchUrl:url,limit:200,clock:()=>time,sleep:async ms=>{time+=ms;calls.sleep.push(ms);},scroll:async()=>{},navigate:async value=>{calls.navigate.push(value);current=Number(new URL(value).searchParams.get('page'));},read:async()=>{
  calls.read++;return {url:change??pageURL(url,current),results:pages[current-1]??[],blocked,noResults:noResults||!(pages[current-1]?.length),pagination:{nextExists:true,nextEnabled:current<pages.length,selectedPage:current},scroll:{top:0,height:100,total:100},loading:false};
 }}};
}
test('200 distinct people are collected across 20 actual pages in one invocation',async()=>{
 const f=fixture(Array.from({length:20},(_,i)=>Array.from({length:10},(_,j)=>row(i*10+j))));
 const r=await collectOrdinarySearch(f.config);
 assert.equal(r.returned_count,200);assert.equal(r.pages_viewed,20);assert.equal(r.scroll_rounds,0);assert.equal(r.completeness,'complete');assert.equal(f.calls.navigate.length,19);assert.equal(f.calls.sleep.length,0);
});
test('deduplicates overlap across pages and reports true exhaustion',async()=>{
 const f=fixture([[row(1),row(2)],[row(2),row(3)]]);const r=await collectOrdinarySearch(f.config);
 assert.equal(r.returned_count,3);assert.equal(r.pages_viewed,2);assert.equal(r.stop_reason,'results_exhausted');
});
test('page limit produces resumable checkpoint and does not reread first page',async()=>{
 const f=fixture([[row(1),row(2)],[row(3),row(4)],[row(5)]]);
 const first=await collectOrdinarySearch({...f.config,maxPages:1});
 assert.equal(first.returned_count,2);assert.equal(first.resume.page,2);assert.equal(first.stop_reason,'page_limit');
 const next=await collectOrdinarySearch({...f.config,previous:first.resume});
 assert.equal(next.returned_count,5);assert.equal(next.new_count,3);assert.equal(next.pages_viewed,2);assert.match(f.calls.navigate[0],/page=2/);
});
test('mid-page result limit resumes without losing the remainder',async()=>{
 const f=fixture([[row(1),row(2),row(3)],[row(4)]]);
 const first=await collectOrdinarySearch({...f.config,limit:2});
 assert.equal(first.resume.page,1);assert.equal(first.resume.page_ids.length,3);
 const next=await collectOrdinarySearch({...f.config,limit:4,previous:first.resume});
 assert.deepEqual(next.results.map(r=>r.profileId),['1','2','3','4']);
});
test('query changes, login, verification and platform restrictions stop without fallback',async()=>{
 for(const [patch,code] of [[{change:'https://www.linkedin.com/search/results/people/?keywords=other'},'query_changed'],[{blocked:true},'search_restricted']]){
  const f=fixture([[row(1)]],patch);await assert.rejects(collectOrdinarySearch(f.config),{code});assert.equal(f.calls.navigate.length,0);
 }
 for(const [key,code] of [['login','not_logged_in'],['verification','verification_required']]){
  const f=fixture([[row(1)]]);const read=f.config.read;f.config.read=async()=>({...await read(),[key]:true});await assert.rejects(collectOrdinarySearch(f.config),{code});
 }
});
test('unknown pagination and repeated pages cannot claim complete',async()=>{
 const f=fixture([[row(1)]]);const read=f.config.read;f.config.read=async()=>({...await read(),pagination:{nextExists:false,nextEnabled:false}});
 assert.equal((await collectOrdinarySearch(f.config)).stop_reason,'pagination_unavailable');
 const repeated=fixture([[row(1)],[row(1)],[row(1)]]);assert.equal((await collectOrdinarySearch(repeated.config)).stop_reason,'no_new_people');
});
test('empty page is distinct from timeout and partial errors retain existing rows',async()=>{
 const f=fixture([[]],{noResults:true});const empty=await collectOrdinarySearch(f.config);assert.equal(empty.stop_reason,'verified_empty');assert.equal(empty.completeness,'complete');
 const slow=fixture([[]]);slow.config.read=async()=>({url,results:[],loading:true,pagination:{}});await assert.rejects(collectOrdinarySearch({...slow.config,waitMs:500}),{code:'search_not_rendered'});
 const partial=fixture([[row(1)],[row(2)]]);const read=partial.config.read;partial.config.read=async()=>{const f=await read();return f.pagination.selectedPage===2?{...f,verification:true}:f;};const r=await collectOrdinarySearch(partial.config);assert.equal(r.returned_count,1);assert.equal(r.interruption.code,'verification_required');assert.equal(r.resume,null);
});
test('resume is query-bound and page numbers cannot drift',async()=>{
 const f=fixture([[row(1)]]);await assert.rejects(collectOrdinarySearch({...f.config,previous:{query_fingerprint:queryKey(url.replace('engineer','designer')),page:1,results:[]}}),{code:'cursor_query_mismatch'});
 const read=f.config.read;f.config.read=async()=>({...await read(),pagination:{nextExists:true,nextEnabled:false,selectedPage:7}});await assert.rejects(collectOrdinarySearch(f.config),{code:'page_changed'});
});

test('scrolling merges new IDs in the same actual page with bounded progress waits',async()=>{
 let reads=0,scrolled=false,time=0;
 const result=await collectOrdinarySearch({searchUrl:url,limit:20,clock:()=>time,sleep:async ms=>{time+=ms;},navigate:async()=>{throw Error('one page only');},scroll:async()=>{scrolled=true;},read:async()=>{
  reads++;return {url,results:scrolled?[row(1),row(2)]:[row(1)],pagination:{nextExists:true,nextEnabled:false},scroll:{top:scrolled?100:0,height:100,total:200},loading:false};
 }});
 assert.equal(result.returned_count,2);assert.equal(result.pages_viewed,1);assert.equal(result.scroll_rounds,1);assert.ok(time<=500);assert.ok(reads>=2);
});

test('combined live DOM observation extracts cards and Next without header noise',async()=>{
 const vm=await import('node:vm');const {inspectOrdinarySearchDOM}=await import('../lib/ordinary-search-collector.js');
 const link={href:'https://www.linkedin.com/in/fixture/?tracking=1',textContent:'Fixture • 2nd Engineer Singapore'};
 const card={textContent:link.textContent,querySelector:()=>link};
 const next={disabled:false,textContent:'Next',getBoundingClientRect:()=>({top:80,bottom:100}),getAttribute:k=>k==='aria-label'?'Next':null,getClientRects:()=>[{}]};
 const selected={textContent:'1',getAttribute:()=>null};
 const root={querySelector:()=>null,querySelectorAll:selector=>selector==='li.reusable-search__result-container'?[card]:[]};
 const document={querySelector:()=>root,querySelectorAll:selector=>selector==='[aria-current="page"]'?[selected]:[next],scrollingElement:{scrollTop:0,clientHeight:100,scrollHeight:100}};
 const result=vm.runInNewContext('('+inspectOrdinarySearchDOM.toString()+')()',{document,location:new URL(url),URL,innerHeight:100,getComputedStyle:()=>({overflowY:'visible'})});
 assert.equal(result.results.length,1);assert.equal(result.results[0].profileUrl,'https://www.linkedin.com/in/fixture/');assert.equal(result.pagination.nextEnabled,true);assert.equal(result.pagination.selectedPage,1);
 next.disabled=true;assert.equal(vm.runInNewContext('('+inspectOrdinarySearchDOM.toString()+')()',{document,location:new URL(url),URL,innerHeight:100,getComputedStyle:()=>({overflowY:'visible'})}).pagination.nextEnabled,false);
});

test('new LinkedIn workspace is the scroll target instead of the document body',async()=>{
 const vm=await import('node:vm');const {scrollOrdinarySearchDOM}=await import('../lib/ordinary-search-collector.js');
 const workspace={scrollTop:0,clientHeight:400,scrollHeight:1600};const body={scrollTop:0,clientHeight:900,scrollHeight:900};
 vm.runInNewContext('('+scrollOrdinarySearchDOM.toString()+')()',{document:{querySelector:()=>workspace,scrollingElement:body},getComputedStyle:()=>({overflowY:'auto'})});
 assert.equal(workspace.scrollTop,500);assert.equal(body.scrollTop,0);
});
