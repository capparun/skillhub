import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../lib/engine.js';
for(const residuePersists of [false,true])test(`omitted top filters are cleared and independently checked: residuePersists=${residuePersists}`,async()=>{
 const values={title:'旧职位',company:'旧公司',keyword:'嵌入式开发'},summaries=new Set(['title','company']);let active;const cleared=[];
 const page={evaluate:async(_fn,r)=>{
  if(r.mode==='selection-summary')return {url:'https://h.liepin.com/search/getConditionItem',selected:[...summaries].map(key=>({title:key==='title'?'职位名称':'公司名称',text:'残留'}))};
  return {url:'https://h.liepin.com/search/getConditionItem',...(r.key?{target:r.key,rootPath:`#${r.key}-root`,value:values[r.key],confirm:r.key==='keyword'?null:`${r.key}-confirm`}:{})};
 },click:async selector=>{if(selector.endsWith('-confirm')){const key=selector.replace('-confirm','');if(!residuePersists)summaries.delete(key);}else active=selector;},
 fillText:async(selector,value)=>{assert.equal(active,selector);values[selector]=value;cleared.push(selector);}};
 if(residuePersists){await assert.rejects(run(page,{keyword:'嵌入式开发'},{submit:false,pause:async()=>{}}),/仍残留已选摘要/);assert.deepEqual(cleared,['title']);}
 else{const result=await run(page,{keyword:'嵌入式开发'},{submit:false,pause:async()=>{}});assert.deepEqual(cleared,['title','company']);assert.equal(result.applied.length,1);}
});
for(const submit of [false,true])test(`ambiguous submit button only blocks submitting: ${submit}`,async()=>{
 let value='',clicks=[];
 const page={evaluate:async(_fn,request)=>({url:'https://h.liepin.com/search/getConditionItem',...(request.mode==='controls'?{submit:null,submitCount:2}:{target:'#keyword',value})}),click:async s=>clicks.push(s),fillText:async(_s,v)=>{value=v;}};
 if(submit){await assert.rejects(run(page,{keyword:'嵌入式开发'},{submit,pause:async()=>{}}),/未找到搜索控件/);assert.equal(clicks.length,0);}
 else {const result=await run(page,{keyword:'嵌入式开发'},{submit,pause:async()=>{}});assert.equal(result.applied.length,1);assert.equal(result.rows.length,0);assert.ok(clicks.every(s=>s==='#keyword'));}
});
test('already correct keyword is verified without clicking, scrolling or expanding it',async()=>{
 const page={evaluate:async()=>({url:'https://h.liepin.com/search/getConditionItem',target:'#keyword',value:'嵌入式开发',targetEvidence:{hitRelation:'other'},expand:'#more'}),click:async()=>assert.fail('unnecessary click'),scrollTo:async()=>assert.fail('unnecessary scroll'),fillText:async()=>assert.fail('unnecessary refill')};
 const result=await run(page,{keyword:'嵌入式开发'},{submit:false,pause:async()=>{}});assert.equal(result.applied[0].value,'嵌入式开发');
});
test('clipped autocomplete expands before attempting to scroll the hidden input',async()=>{
 let expanded=false,committed=false;const events=[];
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.key?{
  target:'#industry',targetEvidence:{hitRelation:expanded?'self':'other'},expand:expanded?null:'#more',
  option:'#option',committed,value:'互联网'}:{})}),
  scrollTo:async selector=>{if(selector==='#industry')assert.equal(expanded,true);events.push(['scroll',selector]);},
  click:async selector=>{events.push(['click',selector]);if(selector==='#more')expanded=true;if(selector==='#option')committed=true;},
  fillText:async()=>{},hover:async()=>{}};
 const result=await run(page,{industry:'互联网'},{submit:false,pause:async()=>{}});
 assert.equal(result.applied.length,1);
 assert.ok(events.findIndex(event=>event[0]==='click'&&event[1]==='#more')<events.findIndex(event=>event[0]==='scroll'&&event[1]==='#industry'));
});
test('readonly autocomplete activates outer selector before scrolling or filling input',async()=>{
 let activated=false,committed=false;const events=[];
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.key?{
  target:'#industry',activationTarget:activated?null:'#selector',inputReadOnly:!activated,
  targetEvidence:{hitRelation:'self'},option:'#option',committed,value:'互联网'}:{})}),
  scrollTo:async selector=>{if(selector==='#industry')assert.equal(activated,true);events.push(selector);},
  click:async selector=>{if(selector==='#selector')activated=true;if(selector==='#option')committed=true;},
  fillText:async()=>assert.equal(activated,true)};
 const result=await run(page,{industry:'互联网'},{submit:false,pause:async()=>{}});
 assert.equal(result.applied.length,1);assert.equal(events[0],'#selector');
});
test('clipped choices locate the expansion control again after scrolling before hover',async()=>{
 let expanded=false,scrolled=false,selected=false;const events=[];
 const page={
  evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.label?{choice:'#english',selected,choiceEvidence:{hitRelation:expanded?'self':'other'},expand:scrolled?'#more-current':'#more-before-scroll'}:{})}),
  scrollTo:async s=>{events.push(['scroll',s]);if(s==='#more-before-scroll')scrolled=true;},
  hover:async s=>{events.push(['hover',s]);if(s.startsWith('#more'))assert.equal(s,'#more-current');},
  click:async s=>{events.push(['click',s]);if(s==='#more-current')expanded=true;else if(s==='#english')selected=true;else assert.fail(s);},
 };
 const result=await run(page,{language:'英语'},{submit:false,pause:async()=>{}});
 assert.equal(result.applied.length,1);assert.equal(selected,true);
 assert.deepEqual(events.slice(0,3),[['scroll','#more-before-scroll'],['hover','#more-current'],['click','#more-current']]);
});
test('delayed city selection gets one additional read without a second click',async()=>{
 let clicked=false,selected=false,clicks=0,lateReads=0;
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.label?{choice:'#city',selected,choiceEvidence:{hitRelation:'self'}}:{})}),click:async()=>{clicked=true;clicks++;}};
 const result=await run(page,{city:'深圳'},{submit:false,pause:async ms=>{if(clicked&&ms===1500){selected=true;lateReads++;}}});
 assert.equal(result.applied[0].value,'深圳');assert.equal(clicks,1);assert.equal(lateReads,1);
});
test('city that remains unselected stops after bounded observation without reclicking',async()=>{
 let clicks=0,lateReads=0;
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.label?{choice:'#city',selected:false,choiceEvidence:{hitRelation:'self'}}:{})}),click:async()=>{clicks++;}};
 await assert.rejects(run(page,{city:'深圳'},{submit:false,pause:async ms=>{if(ms===1500)lateReads++;}}),/未能确认生效/);
 assert.equal(clicks,1);assert.equal(lateReads,1);
});
test('verification errors preserve diagnosis without embedding raw DOM or page input',async()=>{
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.label?{choice:'#city',selected:false,choiceEvidence:{hitRelation:'self',html:'private-html-marker'},rootHtml:'private-root-marker',value:'private-value-marker'}:{})}),click:async()=>{}};
 await assert.rejects(run(page,{city:'深圳'},{submit:false,pause:async()=>{}}),e=>{
  assert.equal(e.code,'VERIFY');assert.match(e.message,/"field":"city"/);assert.match(e.message,/"selected":false/);assert.doesNotMatch(e.message,/private-(html|root|value)-marker/);return true;
 });
});
test('automatic query loading is observed until settled before filling the next control',async()=>{
 let remaining=3,value='',clicked=0,loadingReads=0;
 const page={evaluate:async(_fn,r)=>{const loading=r.label&&remaining-->0;if(loading)loadingReads++;return {url:'https://h.liepin.com/search/getConditionItem',loading,target:r.key,value:r.key==='salaryMax'?'':value,rangeSummaries:['10万以上'],confirm:'#confirm'};},click:async()=>{assert.ok(remaining<0);clicked++;},fillText:async(_s,v)=>{value=v;}};
 const result=await run(page,{salaryMin:'10'},{submit:false,pause:async()=>{}});assert.equal(result.applied.length,1);assert.equal(loadingReads,3);assert.equal(clicked,3);
});
test('persistent loading stops with LOADING before any click',async()=>{
 let observations=0;
 const page={evaluate:async()=>{observations++;return {url:'https://h.liepin.com/search/getConditionItem',loading:true};},click:async()=>assert.fail('loading page must not be clicked')};
 await assert.rejects(run(page,{salaryMin:'10'},{submit:false,pause:async()=>{}}),e=>e.code==='LOADING');assert.equal(observations,13);
});
for(const persists of [true,false])test(`number input is checked again after its confirmation: persists=${persists}`,async()=>{
 let value='',confirmed=false,confirmClicks=0;
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.label?{target:r.key,value:r.key==='salaryMax'?'':value,rangeSummaries:['10万以上'],confirm:confirmed?null:'#confirm'}:{})}),click:async s=>{if(s==='#confirm'){confirmed=true;confirmClicks++;if(!persists)value='';}},fillText:async(_s,v)=>{value=v;}};
 if(persists){const result=await run(page,{salaryMin:'10'},{submit:false,pause:async()=>{}});assert.equal(result.applied.length,1);}
 else await assert.rejects(run(page,{salaryMin:'10'},{submit:false,pause:async()=>{}}),/确认后未能保持请求值/);
 assert.equal(confirmClicks,1);
});
test('salary pair is filled before a single confirmation and both bounds are rechecked',async()=>{
 const values={salaryMin:'',salaryMax:''};let focused,confirms=0;const events=[];
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.key?{target:r.key,value:values[r.key],rangeSummaries:['10-50万'],confirm:'#confirm'}:{})}),click:async s=>{if(s==='#confirm'){assert.deepEqual(values,{salaryMin:'10',salaryMax:'50'});confirms++;events.push('confirm');}else focused=s;},fillText:async(s,v)=>{assert.equal(s,focused);values[s]=v;events.push(s);}};
 const result=await run(page,{salaryMin:'10',salaryMax:'50'},{submit:false,pause:async()=>{}});
 assert.equal(confirms,1);assert.deepEqual(events,['salaryMin','salaryMax','confirm']);assert.equal(result.applied.length,2);
});
test('salary pair fails if confirming the upper bound changes the lower bound',async()=>{
 const values={salaryMin:'',salaryMax:''};let confirms=0;
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.key?{target:r.key,value:values[r.key],rangeSummaries:['10-50万'],confirm:'#confirm'}:{})}),click:async s=>{if(s==='#confirm'){values.salaryMin='';confirms++;}},fillText:async(s,v)=>{values[s]=v;}};
 await assert.rejects(run(page,{salaryMin:'10',salaryMax:'50'},{submit:false,pause:async()=>{}}),/另一边界发生变化/);assert.equal(confirms,1);
});

test('a numeric draft without a confirmation control is not reported as applied',async()=>{
 let value='';
 const page={evaluate:async()=>({url:'https://h.liepin.com/search/getConditionItem',target:'#salary',value}),click:async()=>{},fillText:async(_s,v)=>{value=v;}};
 await assert.rejects(run(page,{salaryMin:'10',salaryMax:'50'},{submit:false,pause:async()=>{}}),e=>e.code==='CONTROL'&&/未确认提交/.test(e.message));
});

for(const prefix of ['salary','expectedSalary'])for(const side of ['Min','Max'])test(`${prefix}${side} clears a stale omitted boundary before one confirmation`,async()=>{
 const key=prefix+side,other=prefix+(side==='Min'?'Max':'Min');
 const values={[key]:'12',[other]:'60'};let confirms=0;
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.key?{target:r.key,value:values[r.key],rangeSummaries:[side==='Min'?'20万以上':'20万以下'],confirm:'#confirm'}:{})}),click:async s=>{if(s==='#confirm'){assert.equal(values[other],'');assert.equal(values[key],'20');confirms++;}},fillText:async(s,v)=>{values[s]=v;}};
 const result=await run(page,{[key]:'20'},{submit:false,pause:async()=>{}});
 assert.equal(confirms,1);assert.deepEqual(result.applied,[{field:key,value:'20'}]);
});
test('equal salary DOM draft is re-entered so native skip cannot retain stale application state',async()=>{
 const dom={salaryMin:'',salaryMax:'50'},model={salaryMin:'',salaryMax:''};let summary=[];const edits=[];
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.key?{target:r.key,value:dom[r.key],confirm:'#confirm',rangeSummaries:summary}:{})}),
  click:async s=>{if(s==='#confirm')summary=[`${model.salaryMin}-${model.salaryMax}万`];},
  fillText:async(s,v)=>{if(dom[s]===v)return;dom[s]=v;model[s]=v;edits.push([s,v]);}};
 const result=await run(page,{salaryMin:'10',salaryMax:'50'},{submit:false,pause:async()=>{}});
 assert.equal(result.applied.length,2);assert.deepEqual(edits,[['salaryMin','10'],['salaryMax',''],['salaryMax','50']]);assert.deepEqual(summary,['10-50万']);
});
test('correct numeric inputs with a lower-only selected summary stop before search',async()=>{
 const values={salaryMin:'',salaryMax:''};let searched=false;
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.mode==='controls'?{submit:'#search'}:r.key?{target:r.key,value:values[r.key],confirm:'#confirm',rangeSummaries:['10万以上']}:{})}),click:async s=>{if(s==='#search')searched=true;},fillText:async(s,v)=>{values[s]=v;}};
 await assert.rejects(run(page,{salaryMin:'10',salaryMax:'50'},{pause:async()=>{}}),/已选摘要与请求范围不一致/);assert.equal(searched,false);
});
test('collapsed select drawer is expanded before clicking its trigger',async()=>{
 let expanded=false,scrolled=false,opened=false,committed=false;const events=[];
 const page={evaluate:async(_fn,r)=>({url:'https://h.liepin.com/search/getConditionItem',...(r.label?{target:'#status',targetEvidence:{hitRelation:expanded?'self':'other'},expand:scrolled?'#more-current':'#more',dropdownCount:opened?1:0,option:opened?'#left-job':null,committed}:{})}),
 scrollTo:async s=>{events.push(['scroll',s]);if(s==='#more')scrolled=true;},hover:async s=>{assert.equal(s,'#more-current');},
 click:async s=>{events.push(['click',s]);if(s==='#more-current')expanded=true;else if(s==='#status'){assert.equal(expanded,true);opened=true;}else if(s==='#left-job')committed=true;else assert.fail(s);}};
 const result=await run(page,{jobStatus:'离职,正在找工作'},{submit:false,pause:async()=>{}});
 assert.deepEqual(result.applied,[{field:'jobStatus',value:'离职,正在找工作'}]);
 assert.ok(events.findIndex(e=>e[0]==='click'&&e[1]==='#more-current')<events.findIndex(e=>e[0]==='click'&&e[1]==='#status'));
});
