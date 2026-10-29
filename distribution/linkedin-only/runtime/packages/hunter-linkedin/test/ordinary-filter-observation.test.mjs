import test from 'node:test';import assert from 'node:assert/strict';
import {inspectOrdinarySearchDOM,collectOrdinarySearch} from '../lib/ordinary-search-collector.js';
test('new-layout DIV filter chips are captured without inventing selection',()=>{
 const saved=Object.fromEntries(['document','location','innerHeight'].map(k=>[k,globalThis[k]]));
 const chip={tagName:'DIV',textContent:'Stanford University',getClientRects:()=>[{}],getAttribute:k=>k==='role'?'button':null};
 const next={...chip,textContent:'Next',disabled:true,getBoundingClientRect:()=>({top:0,bottom:20})};
 const selected={...chip,textContent:'',checked:true,getClientRects:()=>[],labels:[{getClientRects:()=>[{}]}],getAttribute:k=>k==='aria-label'?'Microsoft':null};
 const doc={querySelector:()=>null,querySelectorAll:selector=>selector==='button,[role="button"],a[aria-label],label[for]'?[chip,next]:selector.startsWith('input[type="checkbox"]:checked')?[selected]:[],scrollingElement:{scrollTop:0,clientHeight:100,scrollHeight:100}};
 try{globalThis.document=doc;globalThis.location={href:'https://www.linkedin.com/search/results/people/?keywords=engineer',pathname:'/search/results/people/'};globalThis.innerHeight=100;
 const frame=inspectOrdinarySearchDOM();assert.equal(frame.filter_state.controls[0].text,'Stanford University');assert.equal(frame.filter_state.controls[0].pressed,null);assert.deepEqual(frame.filter_state.selected,[{text:'Microsoft',evidence:'checked'}]);assert.equal(frame.pagination.nextExists,true);
 }finally{for(const [k,v] of Object.entries(saved))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});
test('page observations are returned alongside rows without additional browser reads',async()=>{
 const url='https://www.linkedin.com/search/results/people/?keywords=engineer';let reads=0;
 const result=await collectOrdinarySearch({searchUrl:url,limit:1,read:async()=>{reads++;return {url,results:[{profileId:'fixture',profileUrl:'https://www.linkedin.com/in/fixture/'}],filter_state:{controls:[{text:'Microsoft',pressed:null}],selected:[]},pagination:{nextExists:true,nextEnabled:false},scroll:{top:0,height:100,total:100}};},navigate:()=>assert.fail('unexpected navigation'),scroll:()=>assert.fail('unexpected scroll')});
 assert.equal(reads,1);assert.equal(result.filter_observations[0].page,1);assert.equal(result.filter_observations[0].controls[0].text,'Microsoft');assert.deepEqual(result.filter_observations[0].selected,[]);
});

test('three people on a page with Next is a page-budget boundary, not exhaustion',async()=>{
 const url='https://www.linkedin.com/search/results/people/?keywords=designer';
 const result=await collectOrdinarySearch({searchUrl:url,limit:5,maxPages:1,read:async()=>({url,results:[1,2,3].map(n=>({profileId:'fixture'+n,profileUrl:'https://www.linkedin.com/in/fixture'+n+'/'})),pagination:{nextExists:true,nextEnabled:true},scroll:{top:529,height:696,total:1225}}),navigate:()=>assert.fail('must not exceed page budget'),scroll:()=>assert.fail('already at bottom')});
 assert.equal(result.returned_count,3);assert.equal(result.stop_reason,'page_limit');assert.equal(result.completeness,'partial');assert.deepEqual(result.page_observations,[{page:1,anonymous_people:0,next_exists:true,next_enabled:true,observed_unique_people:3}]);assert.equal(result.resume.page,2);
});

test('rendered anonymous LinkedIn members are not mislabeled as render timeout or invented identities',async()=>{
 const url='https://www.linkedin.com/search/results/people/?keywords=engineer';let reads=0;
 const result=await collectOrdinarySearch({searchUrl:url,limit:30,maxPages:3,read:async()=>{reads++;return {url,results:[],anonymous_count:3,pagination:{nextExists:true,nextEnabled:true},scroll:{top:0,height:100,total:100}};},navigate:()=>assert.fail('no retry'),scroll:()=>assert.fail('no additional identities available')});
 assert.equal(reads,1);assert.equal(result.returned_count,0);assert.equal(result.stop_reason,'profile_identity_unavailable');assert.equal(result.completeness,'partial');assert.equal(result.page_observations[0].anonymous_people,3);assert.equal(result.resume,null);
});
