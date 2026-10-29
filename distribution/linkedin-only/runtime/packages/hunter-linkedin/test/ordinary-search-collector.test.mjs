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
 // Card counts are per run while collected_total includes people carried by the cursor.
 assert.equal(next.identity_summary.named_cards,3);assert.equal(next.identity_summary.collected_total,5);
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
test('completed page is checkpointed before next navigation fails',async()=>{
 const f=fixture([[row(1),row(2)],[row(3)]]);let saved;
 const result=await collectOrdinarySearch({...f.config,onCheckpoint:async p=>{saved=p;},navigate:async()=>{assert.equal(saved.page,2);throw Object.assign(Error('timeout'),{code:'navigation_timeout'});}});
 assert.deepEqual(saved.results.map(r=>r.profileId),['1','2']);
 assert.equal(result.interruption.code,'navigation_timeout');assert.equal(result.resume,null);
 const resumed=await collectOrdinarySearch({...fixture([[row(1),row(2)],[row(3)]]).config,previous:saved});
 assert.equal(resumed.returned_count,3);assert.equal(resumed.new_count,1);
});
test('checkpoint failure prevents next-page navigation',async()=>{
 const f=fixture([[row(1)],[row(2)]]);
 const result=await collectOrdinarySearch({...f.config,onCheckpoint:async()=>{throw Error('disk full');}});
 assert.equal(result.interruption.code,'checkpoint_write_failed');assert.equal(f.calls.navigate.length,0);
});
test('anonymous cards that resolve during readiness are collected without renavigation',async()=>{
 const f=fixture([[row(1),row(2)]]);const read=f.config.read;let reads=0;
 const result=await collectOrdinarySearch({...f.config,read:async()=>{const frame=await read();return ++reads<3?{...frame,results:[],anonymous_count:2}:frame;}});
 assert.equal(result.returned_count,2);assert.equal(result.interruption,null);assert.equal(f.calls.navigate.length,0);assert.equal(result.timing.readiness_ms,500);
});
test('persistent anonymous cards stop only after bounded readiness wait',async()=>{
 const f=fixture([[row(1)]]);const read=f.config.read;
 const result=await collectOrdinarySearch({...f.config,waitMs:1000,read:async()=>({...await read(),results:[],anonymous_count:1})});
 assert.equal(result.stop_reason,'profile_identity_unavailable');assert.equal(result.timing.readiness_ms,1000);assert.equal(f.calls.navigate.length,0);
});
test('loading cards are not accepted merely because names already exist',async()=>{
 const f=fixture([[row(1)]]);const read=f.config.read;let reads=0;
 const result=await collectOrdinarySearch({...f.config,read:async()=>({...await read(),loading:++reads<3})});
 assert.equal(result.returned_count,1);assert.equal(result.timing.readiness_ms,500);
});

for(const nextEnabled of [true,false]) for(const limit of [1,20]) test(`mixed named/anonymous results remain partial (next=${nextEnabled}, limit=${limit})`,async()=>{
 const f=fixture([[row(1)],[row(2)]]);const read=f.config.read;
 const result=await collectOrdinarySearch({...f.config,limit,waitMs:500,read:async()=>{const frame=await read();return {...frame,anonymous_count:1,pagination:{...frame.pagination,nextEnabled}};}});
 assert.equal(result.returned_count,1);assert.equal(result.completeness,'partial');assert.equal(result.stop_reason,'profile_identity_unavailable');assert.equal(result.resume,null);assert.equal(result.interruption.code,'profile_identity_unavailable');assert.equal(f.calls.navigate.length,0);
});

test('role=list markup classifies obfuscated anonymous cards instead of reporting no render',async()=>{
 const vm=await import('node:vm');const {inspectOrdinarySearchDOM}=await import('../lib/ordinary-search-collector.js');
 const card=(text,href)=>({textContent:text,querySelector:sel=>sel.includes('/in/')&&href?{href}:null});
 const named=card('One • 2nd Engineer','https://www.linkedin.com/in/one/?trk=public');
 const anonymous=card('LinkedIn Member Software Engineer at Capitec Cape Town');
 const unresolved=card('Untitled result');
 const list={querySelectorAll:sel=>sel==='[role="listitem"]'?[named,anonymous,unresolved]:[]};
 const root={innerText:'',querySelector:()=>null,querySelectorAll:sel=>sel==='[role="list"]'?[list]:[]};
 const document={querySelector:()=>root,querySelectorAll:()=>[],scrollingElement:{scrollTop:0,clientHeight:100,scrollHeight:100}};
 const result=vm.runInNewContext('('+inspectOrdinarySearchDOM.toString()+')()',{document,location:new URL(url),URL,innerHeight:100,getComputedStyle:()=>({overflowY:'visible'})});
 assert.equal(result.identity.cards,3);
 assert.equal(result.identity.identified,1);
 assert.equal(result.identity.visibility_limited,1);
 assert.equal(result.identity.unresolved,1);
 assert.equal(result.identity.source,'result_cards');
 assert.equal(result.diagnostics.matchedSelector,'[role="list"] [role="listitem"]');
 assert.deepEqual([...result.results].map(r=>r.profileId),['one']);
});
test('no cursor is offered when the last page has no readable continuation',async()=>{
 const f=fixture([[row(1),row(2)]]);const read=f.config.read;
 const r=await collectOrdinarySearch({...f.config,read:async()=>{const frame=await read();return {...frame,pagination:{nextExists:false,nextEnabled:false,nextInViewport:false,ambiguous:false,selectedPage:1}};}});
 assert.equal(r.stop_reason,'pagination_unavailable');assert.equal(r.resume,null);
 const g=fixture([[row(1)],[row(1)],[row(2)]]);const gr=await collectOrdinarySearch(g.config);
 assert.equal(gr.stop_reason,'no_new_people');assert.equal(gr.resume,null);
});
test('cursor is offered when the next page exists',async()=>{
 const f=fixture([[row(1)],[row(2)]]);const r=await collectOrdinarySearch({...f.config,maxPages:1});
 assert.equal(r.stop_reason,'page_limit');assert.equal(r.resume.page,2);assert.equal(r.resume.anonymous_policy,'stop');
});
test('anonymous page returns once the card signature settles instead of waiting the cap',async()=>{
 const f=fixture([[row(1)]]);const read=f.config.read;
 const result=await collectOrdinarySearch({...f.config,waitMs:15000,anonymousPolicy:'stop',read:async()=>{const frame=await read();return {...frame,anonymous_count:1};}});
 assert.equal(result.stop_reason,'profile_identity_unavailable');
 assert.ok(result.timing.readiness_ms<=1500,String(result.timing.readiness_ms));
 assert.deepEqual(result.results.map(r=>r.profileId),['1']);
});
test('empty pages still fail at the cap rather than settling early',async()=>{
 const f=fixture([[]]);const read=f.config.read;
 await assert.rejects(collectOrdinarySearch({...f.config,waitMs:500,read:async()=>{const frame=await read();return {...frame,noResults:false};}}),{code:'search_not_rendered'});
});
test('anonymous pages keep paginating by card signature, not named growth',async()=>{
 const f=fixture([[], [], [], []]);const read=f.config.read;
 const result=await collectOrdinarySearch({...f.config,maxPages:3,anonymousPolicy:'continue',read:async()=>{const frame=await read();return {...frame,noResults:false,anonymous_count:1,card_signature:'page-'+frame.pagination.selectedPage};}});
 assert.equal(result.stop_reason,'page_limit');
 assert.equal(result.pages_viewed,3);
 assert.equal(result.resume.page,4);
});
test('identical consecutive card signatures stop as repeated pages',async()=>{
 const f=fixture([[], [], []]);const read=f.config.read;
 const result=await collectOrdinarySearch({...f.config,maxPages:10,anonymousPolicy:'continue',read:async()=>{const frame=await read();return {...frame,noResults:false,anonymous_count:1,card_signature:'same'};}});
 assert.equal(result.stop_reason,'no_new_people');
 assert.equal(result.pages_viewed,2);
 assert.equal(result.resume,null);
});
test('anonymous state is classified per result card, not from whole-page text',async()=>{
 const vm=await import('node:vm');const {inspectOrdinarySearchDOM}=await import('../lib/ordinary-search-collector.js');
 const named=n=>({href:`https://www.linkedin.com/in/${n}/?trk=public`,textContent:`${n} • 2nd Engineer`});
 const cards=[{textContent:named('one').textContent,querySelector:()=>({href:named('one').href})},
  {textContent:'LinkedIn Member',querySelector:()=>null},
  {textContent:named('two').textContent,querySelector:()=>({href:named('two').href})}];
 const root={innerText:'LinkedIn Member\n3 mutual connections including LinkedIn Member',querySelector:()=>null,querySelectorAll:selector=>selector==='li.reusable-search__result-container'?cards:[]};
 const document={querySelector:()=>root,querySelectorAll:()=>[],scrollingElement:{scrollTop:0,clientHeight:100,scrollHeight:100}};
 const result=vm.runInNewContext('('+inspectOrdinarySearchDOM.toString()+')()',{document,location:new URL(url),URL,innerHeight:100,getComputedStyle:()=>({overflowY:'visible'})});
 assert.equal(result.anonymous_count,1);
 assert.equal(result.identity.identified,2);assert.equal(result.identity.visibility_limited,1);assert.equal(result.identity.unresolved,0);assert.equal(result.identity.cards,3);assert.equal(result.identity.source,'result_cards');
 assert.deepEqual([...result.results].map(r=>r.profileId),['one','two']);
});

test('unresolved cards stop the page without discarding named people',async()=>{
 const f=fixture([[row(1),row(2)]]);const read=f.config.read;
 const result=await collectOrdinarySearch({...f.config,waitMs:500,read:async()=>{const frame=await read();
  return {...frame,identity:{identified:2,visibility_limited:3,unresolved:1,cards:6},anonymous_count:3};}});
 assert.deepEqual(result.results.map(r=>r.profileId),['1','2']);
 assert.equal(result.stop_reason,'profiles_unresolved');
 assert.equal(result.interruption.code,'profiles_unresolved');
 assert.equal(result.completeness,'partial');
 assert.equal(result.resume,null);
 assert.equal(result.identity_summary.unresolved_cards,1);
 assert.equal(result.identity_summary.visibility_limited_cards,3);
 assert.equal(result.identity_summary.named_cards,2);
 assert.equal(result.identity_summary.collected_total,2);
 assert.equal(result.identity_summary.scope,'per_run_cards_with_cumulative_total');
 assert.equal(f.calls.navigate.length,0);
});

test('continue policy preserves named people and advances past anonymous cards',async()=>{
 const f=fixture([[row(1)],[row(2)],[row(3)]]);const read=f.config.read;
 const anonymousPage=(frame,page)=>page<3?{...frame,identity:{identified:frame.results.length,visibility_limited:1,unresolved:0,cards:frame.results.length+1},anonymous_count:1}:frame;
 const result=await collectOrdinarySearch({...f.config,waitMs:500,anonymousPolicy:'continue',read:async()=>{const frame=await read();const page=frame.pagination.selectedPage;return anonymousPage(frame,page);}});
 assert.deepEqual(result.results.map(r=>r.profileId),['1','2','3']);
 assert.equal(result.pages_viewed,3);
 assert.equal(result.completeness,'complete');
 assert.equal(result.stop_reason,'results_exhausted');
 assert.equal(f.calls.navigate.length,2);
 assert.equal(result.identity_summary.visibility_limited_cards,2);
 assert.equal(result.identity_summary.cross_page_dedupe,'named_only');
 assert.equal(result.resume,null);
});

test('continue policy cannot claim completeness at the last anonymous page',async()=>{
 const f=fixture([[row(1)],[row(2)]]);const read=f.config.read;
 const result=await collectOrdinarySearch({...f.config,waitMs:500,anonymousPolicy:'continue',read:async()=>{const frame=await read();
  return frame.pagination.selectedPage<2?{...frame,anonymous_count:1}:{...frame,anonymous_count:1,pagination:{...frame.pagination,nextEnabled:false}};}});
 assert.deepEqual(result.results.map(r=>r.profileId),['1','2']);
 assert.equal(result.stop_reason,'visibility_limited_pagination_end');
 assert.equal(result.completeness,'partial');
 assert.equal(result.resume,null);
});

test('cursor is policy-bound and resumes carry the same policy',async()=>{
 const previous={query_fingerprint:queryKey(url),page:1,results:[],anonymous_policy:'continue'};
 await assert.rejects(collectOrdinarySearch({searchUrl:url,limit:20,previous,anonymousPolicy:'stop',read:async()=>{throw Error('unexpected');},navigate:async()=>{},scroll:async()=>{}}),{code:'cursor_policy_mismatch'});
 const f=fixture([[row(1)],[row(2)]]);const result=await collectOrdinarySearch({...f.config,maxPages:1,anonymousPolicy:'continue'});
 assert.equal(result.resume.anonymous_policy,'continue');
});

 test('unresolved identities cannot disappear through scrolling and become complete',async()=>{
 const f=fixture([[row(1)]]);const read=f.config.read;let scrolled=false;
 const result=await collectOrdinarySearch({...f.config,waitMs:500,
 scroll:async()=>{scrolled=true;},
 read:async()=>({...await read(),anonymous_count:scrolled?0:1,
 results:scrolled?[row(2)]:[row(1)],
 scroll:{top:scrolled?100:0,height:100,total:200}})});
 assert.equal(scrolled,false);
 assert.deepEqual(result.results.map(r=>r.profileId),['1']);
 assert.equal(result.completeness,'partial');
 assert.equal(result.stop_reason,'profile_identity_unavailable');
 assert.equal(result.resume,null);
 });
