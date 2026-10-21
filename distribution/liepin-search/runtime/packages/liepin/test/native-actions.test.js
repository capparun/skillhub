import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createNativeActions,inspectActionTarget} from '../lib/native-actions.js';
const expectedUrl='https://h.liepin.com/search/getConditionItem';
const action={actionId:'submit-once',selector:'.search-btn'};
const ready={status:'ready',url:expectedUrl,x:120,y:80};
function driver(options={}) {
  const calls=[];
  const page={evaluate:async(fn,args)=>{calls.push(['read',fn,args]);return options.target ?? ready;},
    cdp:async(method,args)=>{calls.push([method,args]);if(options.failAt===calls.length-1)throw new Error('command_result_unknown');}};
  return {calls,actions:createNativeActions(page,{expectedUrl})};
}
test('direct click dispatches once, reports acknowledgment only and rejects repeated action IDs',async()=>{
  const {calls,actions}=driver();const result=await actions.click(action);
  assert.equal(result.status,'dispatched');assert.equal(result.requiresBusinessVerification,true);
  assert.deepEqual(calls.slice(1).map(c=>c[1].type),['mouseMoved','mousePressed','mouseReleased']);
  await assert.rejects(actions.click(action),e=>e.reason==='duplicate_action');assert.equal(calls.length,4);
  assert.deepEqual(Object.keys(actions),['click','hover','escape','scroll','scrollTo','fill']);
});
test('failure context distinguishes an initial blocked action from a later blocked action',async()=>{
 for(const prior of [0,1]) {
  let reads=0,dispatches=0;
  const actions=createNativeActions({evaluate:async()=>++reads<=prior?ready:{status:'blocked',reason:'target_covered'},
   cdp:async()=>{dispatches++;}},{expectedUrl});
  if(prior)await actions.click({...action,actionId:'before'});
  await assert.rejects(actions.click(action),error=>{
   const {description,...technical}=error.action;assert.match(description,/本动作未发出/);
   assert.deepEqual(technical,{actionId:'submit-once',purpose:'click',outcome:'not_started',acknowledgedActions:prior});
   assert.match(error.message,/不代表业务成功/);return true;
  });
  assert.equal(dispatches,prior*3);
 }
});
test('failure at every dispatch stage stops without fallback, release retry or another action',async()=>{
  for(const failAt of [1,2,3]) {
    const {calls,actions}=driver({failAt});
    await assert.rejects(actions.click(action),e=>e.outcome==='unknown');
    await assert.rejects(actions.click({...action,actionId:'different'}));
    assert.equal(calls.length,failAt+1);
  }
});
test('risk, login, wrong page and malformed geometry block before input',async()=>{
  for(const target of [{status:'blocked',reason:'risk_signal'},{status:'blocked',reason:'login_required'},
    {...ready,url:'https://example.com/'},{...ready,x:NaN}]) {
    const {calls,actions}=driver({target});
    await assert.rejects(actions.click(action),e=>e.outcome==='not_started');
    assert.equal(calls.length,1);
    await assert.rejects(actions.click({...action,actionId:'again'}));assert.equal(calls.length,1);
  }
});
test('concurrent calls cannot inspect or dispatch a second action',async()=>{
  let release;let reads=0;const barrier=new Promise(resolve=>{release=resolve;});
  const actions=createNativeActions({evaluate:async()=>{reads++;await barrier;return ready;},cdp:async()=>{}},{expectedUrl});
  const first=actions.click(action);
  await assert.rejects(actions.click({...action,actionId:'second'}),/busy/);
  release();await first;assert.equal(reads,1);
});
function inspect(overrides={}) {
  const element={disabled:false,getAttribute:()=>null,closest:()=>null,
    getBoundingClientRect:()=>({x:100,y:60,width:40,height:40}),contains:()=>false};
  const context={location:{href:expectedUrl,origin:'https://h.liepin.com'},innerWidth:800,innerHeight:600,
    document:{hasFocus:()=>true,body:{innerText:'合成搜索页面'},readyState:'complete',querySelectorAll:()=>[element],elementFromPoint:()=>element},
    getComputedStyle:()=>({visibility:'visible',display:'block',opacity:'1'})};
  overrides.modify?.(context,element);
  return vm.runInNewContext(`(${inspectActionTarget.toString()})(${JSON.stringify({selector:'.search-btn',expectedUrl,purpose:overrides.purpose ?? 'click'})})`,context);
}
test('fixed evaluator refuses redirects, challenges, duplicate targets, overlays and unavailable controls',()=>{
  assert.equal(inspect().status,'ready');
  for(const [reason,modify] of [
    ['page_changed',c=>{c.location.href='https://example.com/';}],
    ['risk_signal',c=>{c.document.body.innerText='访问过于频繁';}],
    ['login_required',c=>{c.document.body.innerText='请登录';}],
    ['page_loading',c=>{c.document.readyState='loading';}],
    ['target_not_unique',(c,e)=>{c.document.querySelectorAll=()=>[e,e];}],
    ['target_covered',c=>{c.document.elementFromPoint=()=>({});}],
    ['target_unavailable',(c,e)=>{e.disabled=true;}],
    ['target_outside_viewport',(c,e)=>{e.getBoundingClientRect=()=>({x:900,y:0,width:20,height:20});}],
  ])assert.equal(inspect({modify}).reason,reason);
});
test('non-search pages are refused when constructing the driver',()=>{
  for(const expectedUrl of ['https://example.com/','https://h.liepin.com/','https://user@h.liepin.com/search/getConditionItem']) {
    assert.throws(()=>createNativeActions({},{expectedUrl}));
  }
});
test('production inspector requires an editable focused input and rejects password controls',()=>{
 const setup=(c,e)=>{Object.assign(e,{tagName:'INPUT',type:'text',value:'旧词',selectionStart:0,selectionEnd:2});c.document.activeElement=e;};
 assert.equal(inspect({purpose:'fill',modify:setup}).value,'旧词');
 for(const modify of [
  (c,e)=>{e.type='password';},(c,e)=>{e.readOnly=true;},
  c=>{c.document.activeElement={};},
 ])assert.equal(inspect({purpose:'fill',modify:(c,e)=>{setup(c,e);modify(c,e);}}).status,'blocked');
});
test('numeric input requires confirmed clearing before inserting once',async()=>{
 for(const failClear of [false,true]) {
  let value='123';const events=[];
  const actions=createNativeActions({evaluate:async()=>({...ready,inputType:'number',value,selectionStart:null,selectionEnd:null}),
    cdp:async(method,args)=>{events.push([method,args]);if(args.key==='Backspace' && args.type==='keyDown' && !failClear)value='';if(method==='Input.insertText')value=args.text;}
  },{expectedUrl});
  if(failClear){await assert.rejects(actions.fill({...action,value:'42.5'}),e=>e.reason==='clear_unconfirmed');assert.equal(events.some(e=>e[0]==='Input.insertText'),false);}
  else {await actions.fill({...action,value:'42.5'});assert.equal(value,'42.5');assert.equal(events.filter(e=>e[0]==='Input.insertText').length,1);}
 }
});
test('scroll resolves one node and stops if scrolling cannot be confirmed',async()=>{
 for(const failScroll of [false,true]) {
  let scrolled=false;const calls=[];
  const actions=createNativeActions({evaluate:async()=>({...ready,inViewport:scrolled}),cdp:async(method)=>{
   calls.push(method);if(method==='DOM.getDocument')return {root:{nodeId:1}};
   if(method==='DOM.querySelectorAll')return {nodeIds:[2]};
   if(method==='DOM.scrollIntoViewIfNeeded' && !failScroll)scrolled=true;
  }},{expectedUrl});
  if(failScroll){await assert.rejects(actions.scrollTo(action),e=>e.reason==='scroll_unconfirmed');await assert.rejects(actions.click({...action,actionId:'retry'}));}
  else await actions.scrollTo(action);
  assert.deepEqual(calls,['DOM.getDocument','DOM.querySelectorAll','DOM.scrollIntoViewIfNeeded']);
 }
});
function inputDriver({failSelection=false,failInsertion=false,loseFocus=false}={}) {
  let value='旧关键词',selected=false;const events=[];
  const page={
    evaluate:async()=>loseFocus && selected ? {status:'blocked',reason:'input_not_focused'}
      : {...ready,value,selectionStart:0,selectionEnd:selected && !failSelection?value.length:0},
    cdp:async(method,params)=>{
      events.push([method,params]);
      if(params.commands)selected=true;
      if(method==='Input.insertText' && !failInsertion)value=params.text;
    },
  };
  return {events,actions:createNativeActions(page,{expectedUrl}),value:()=>value};
}
test('fill uses native editing, verifies selection and reads back Unicode text',async()=>{
  const d=inputDriver();await d.actions.fill({...action,value:'嵌入式开发'});
  assert.equal(d.value(),'嵌入式开发');assert.equal(d.events.length,3);
  assert.deepEqual(d.events.map(e=>e[0]),['Input.dispatchKeyEvent','Input.dispatchKeyEvent','Input.insertText']);
});
test('unconfirmed selection or lost focus cannot insert into another field',async()=>{
  for(const options of [{failSelection:true},{loseFocus:true}]) {
    const d=inputDriver(options);
    await assert.rejects(d.actions.fill({...action,value:'新词'}),e=>e.outcome==='unknown');
    assert.equal(d.events.some(e=>e[0]==='Input.insertText'),false);
    await assert.rejects(d.actions.click({...action,actionId:'submit'}));assert.equal(d.events.length,2);
  }
});
test('failed input verification stops without reinserting or submitting',async()=>{
  const d=inputDriver({failInsertion:true});
  await assert.rejects(d.actions.fill({...action,value:'新词'}),e=>e.reason==='input_unconfirmed');
  await assert.rejects(d.actions.fill({...action,actionId:'again',value:'新词'}));
  assert.equal(d.events.filter(e=>e[0]==='Input.insertText').length,1);
});
test('already correct input does not dispatch editing commands',async()=>{
  const d=inputDriver();await d.actions.fill({...action,value:'旧关键词'});assert.equal(d.events.length,0);
});
test('hover dispatches only one native mouse move and shares the stop latch',async()=>{
  const {actions,calls}=driver({failAt:1});
  await assert.rejects(actions.hover(action),e=>e.outcome==='unknown');
  await assert.rejects(actions.click({...action,actionId:'after-hover'}));
  assert.equal(calls.length,2);assert.equal(calls[1][1].type,'mouseMoved');
});

test('native action permits the observed #session fragment but not query changes',async()=>{
 const accepted=driver({target:{...ready,url:expectedUrl+'#session'}});
 await accepted.actions.click(action);
 assert.equal(accepted.calls.filter(c=>c[0]==='Input.dispatchMouseEvent').length,3);
 const denied=driver({target:{...ready,url:expectedUrl+'?other=1#session'}});
 await assert.rejects(denied.actions.click(action));
 assert.equal(denied.calls.length,1);
});
test('transient coverage is observed again before one click, persistent coverage still blocks',async()=>{
 const {createNativeActionSequence}=await import('../lib/native-actions.js');
 for(const clears of [true,false]){
  let reads=0,dispatches=0,waits=0;
  const actions=createNativeActionSequence({evaluate:async()=>++reads===2&&clears?ready:{status:'blocked',reason:'target_covered'},cdp:async()=>{dispatches++;}},
   {expectedUrl,inspectTarget:inspectActionTarget,pause:async()=>{waits++;}});
  if(clears)await actions.click(action);else await assert.rejects(actions.click(action),e=>e.reason==='target_covered'&&e.outcome==='not_started');
  assert.equal(reads,2);assert.equal(waits,1);assert.equal(dispatches,clears?3:0);
 }
});
test('coverage after fill dispatch is uncertain and never gets a second inspection',async()=>{
 const {createNativeActionSequence}=await import('../lib/native-actions.js');let reads=0,waits=0;
 const actions=createNativeActionSequence({evaluate:async()=>++reads===1?{...ready,value:'old',inputType:'text'}:{status:'blocked',reason:'target_covered'},cdp:async()=>{}},
 {expectedUrl,inspectTarget:inspectActionTarget,pause:async()=>{waits++;}});
 await assert.rejects(actions.fill({...action,value:'new'}),e=>e.outcome==='unknown');assert.equal(reads,2);assert.equal(waits,0);
});
test('covered target records geometry without DOM text or values',()=>{
 const result=inspect({modify:(c,e)=>{e.tagName='INPUT';e.value='secret-value';c.document.elementFromPoint=()=>({tagName:'DIV',className:'sticky-bar',innerText:'private-page-text'});}});
 assert.equal(result.reason,'target_covered');assert.equal(result.geometry.targetTag,'INPUT');assert.equal(result.geometry.hitClass,'sticky-bar');assert.equal(typeof result.geometry.x,'number');assert.doesNotMatch(JSON.stringify(result),/secret-value|private-page-text/);
});
// --- Pre-dispatch reposition for clicks that fell out of the viewport (2026-10-13 select-age-single-salary-group-2) ---
test('click below the viewport is scrolled back into view once and dispatches after re-inspection',async()=>{
  let reads=0,scrolled=false;const calls=[];
  const page={evaluate:async()=>{reads++;return scrolled
    ? {status:'ready',url:expectedUrl,x:120,y:420}
    : {status:'blocked',reason:'target_outside_viewport'};},
   cdp:async(method,args)=>{calls.push([method,args]);
    if(method==='DOM.getDocument')return {root:{nodeId:7}};
    if(method==='DOM.querySelectorAll')return {nodeIds:[8]};
    if(method==='DOM.scrollIntoViewIfNeeded')scrolled=true;}};
  const actions=createNativeActions(page,{expectedUrl});
  const result=await actions.click(action);
  assert.equal(result.status,'dispatched');assert.equal(result.requiresBusinessVerification,true);
  assert.equal(reads,2,'the blocked target is observed again after the reposition');
  assert.equal(calls.filter(c=>c[0]==='DOM.scrollIntoViewIfNeeded').length,1);
  const mouse=calls.filter(c=>c[0]==='Input.dispatchMouseEvent');
  assert.deepEqual(mouse.map(c=>c[1].type),['mouseMoved','mousePressed','mouseReleased']);
  assert.equal(mouse[1][1].y,420,'press lands on fresh post-scroll geometry, never stale coordinates');
});
test('target still outside the viewport after reposition fails closed with not_started and zero dispatches',async()=>{
  const calls=[];
  const page={evaluate:async()=>({status:'blocked',reason:'target_outside_viewport'}),
   cdp:async(method)=>{calls.push(method);
    if(method==='DOM.getDocument')return {root:{nodeId:7}};
    if(method==='DOM.querySelectorAll')return {nodeIds:[8]};}};
  const actions=createNativeActions(page,{expectedUrl});
  await assert.rejects(actions.click(action),error=>{
   assert.equal(error.reason,'target_outside_viewport');
   const {description,...technical}=error.action;assert.match(description,/本动作未发出/);
   assert.deepEqual(technical,{actionId:'submit-once',purpose:'click',outcome:'not_started',acknowledgedActions:0});
   assert.match(error.message,/不自动重试/);return true;});
  assert.equal(calls.includes('Input.dispatchMouseEvent'),false,'no mouse event is dispatched for a blocked target');
  await assert.rejects(actions.click({...action,actionId:'next'}),e=>e.reason==='session_stopped_or_busy');
});
test('dropdown panel reflow pushing the option below the fold is recovered at new coordinates',async()=>{
  // Mirrors the incident: the engine's fixed read found the jobStatus option, then the opened
  // panel reflowed the page; the option center left the 813px viewport before this click ran.
  let optionY=1024,shifted=false;const events=[];
  const page={evaluate:async()=>optionY<813
    ? {status:'ready',url:expectedUrl,x:120,y:optionY}
    : {status:'blocked',reason:'target_outside_viewport'},
   cdp:async(method,args)=>{events.push([method,args]);
    if(method==='DOM.getDocument')return {root:{nodeId:1}};
    if(method==='DOM.querySelectorAll')return {nodeIds:[2]};
    if(method==='DOM.scrollIntoViewIfNeeded'){optionY=340;shifted=true;}}};
  const actions=createNativeActions(page,{expectedUrl});
  await actions.click({actionId:'select-job-status-option',selector:'.ant-select-dropdown .ant-select-item-option'});
  assert.equal(shifted,true);
  const mouse=events.filter(e=>e[0]==='Input.dispatchMouseEvent');
  assert.deepEqual(mouse.map(e=>e[1].y),[340,340,340],'all three mouse events follow the re-inspected position');
});
test('reposition needs the same unique node the scroll resolves and never loops',async()=>{
  const lost={evaluate:async()=>({status:'blocked',reason:'target_outside_viewport'}),
   cdp:async(method)=>{if(method==='DOM.getDocument')return {root:{nodeId:7}};
    if(method==='DOM.querySelectorAll')return {nodeIds:[]};}};
  const actions=createNativeActions(lost,{expectedUrl});
  await assert.rejects(actions.click(action),e=>e.reason==='target_not_unique'&&e.outcome==='not_started');
  const noDom={evaluate:async()=>({status:'blocked',reason:'target_outside_viewport'}),cdp:async()=>{}};
  const actions2=createNativeActions(noDom,{expectedUrl});
  await assert.rejects(actions2.click({...action,actionId:'once'}),e=>e.reason==='document_unavailable'&&e.outcome==='not_started');
});
test('non-click purposes never reposition: fill outside the viewport still blocks before any scroll or edit',async()=>{
  const calls=[];
  const page={evaluate:async()=>({status:'blocked',reason:'target_outside_viewport'}),
   cdp:async(method)=>{calls.push(method);return {root:{nodeId:1},nodeIds:[1]};}};
  const actions=createNativeActions(page,{expectedUrl});
  await assert.rejects(actions.fill({...action,value:'新词'}),e=>e.reason==='target_outside_viewport'&&e.outcome==='not_started');
  assert.equal(calls.includes('DOM.scrollIntoViewIfNeeded'),false);
  assert.equal(calls.some(c=>c.startsWith('Input.')),false);
});

test('filter loading clears before a fill is dispatched, without replay',async()=>{
 const {createNativeActionSequence}=await import('../lib/native-actions.js');let remaining=3,value='old';const waits=[],calls=[];
 const page={evaluate:async()=>remaining-->0?{status:'blocked',reason:'page_loading'}:{...ready,value,inputType:'text',selectionStart:0,selectionEnd:value.length},cdp:async(method,args)=>{assert.ok(remaining<0);calls.push(method);if(method==='Input.insertText')value=args.text;}};
 const actions=createNativeActionSequence(page,{expectedUrl,inspectTarget:inspectActionTarget,pause:async ms=>{waits.push(ms);}});
 await actions.fill({...action,value:'new'});assert.deepEqual(waits,[500,500,500]);assert.equal(calls.filter(m=>m==='Input.insertText').length,1);assert.equal(value,'new');
});
test('persistent pre-dispatch loading waits at most twenty seconds and dispatches nothing',async()=>{
 const {createNativeActionSequence}=await import('../lib/native-actions.js');let reads=0,totalWait=0,dispatches=0;
 const actions=createNativeActionSequence({evaluate:async()=>{reads++;return {status:'blocked',reason:'page_loading'};},cdp:async()=>{dispatches++;}},{expectedUrl,inspectTarget:inspectActionTarget,pause:async ms=>{totalWait+=ms;}});
 await assert.rejects(actions.click(action),e=>e.reason==='page_loading'&&e.outcome==='not_started');assert.equal(reads,41);assert.equal(totalWait,20000);assert.equal(dispatches,0);
});
test('loading after an input dispatch remains unknown and is never waited or replayed',async()=>{
 const {createNativeActionSequence}=await import('../lib/native-actions.js');let reads=0,waits=0;
 const actions=createNativeActionSequence({evaluate:async()=>++reads===1?{...ready,value:'old',inputType:'text'}:{status:'blocked',reason:'page_loading'},cdp:async()=>{}},{expectedUrl,inspectTarget:inspectActionTarget,pause:async()=>{waits++;}});
 await assert.rejects(actions.fill({...action,value:'new'}),e=>e.outcome==='unknown');assert.equal(reads,2);assert.equal(waits,0);
});

test('human action logs distinguish intention, acknowledgment, no-op and blocked input without exposing value',async()=>{
 const events=[];
 const actions=createNativeActions({evaluate:async()=>({...ready,value:'secret',inputType:'text'}),cdp:async()=>{}},{expectedUrl,onAction:e=>events.push(e)});
 await actions.click({...action,label:'关键词输入框'});
 assert.match(events[0].description,/准备将鼠标移到“关键词输入框”并单击/);
 assert.match(events.find(e=>e.phase==='dispatched').description,/已发出操作.*业务结果待回读/);
 await actions.fill({actionId:'same',selector:'#keyword',label:'关键词输入框',value:'secret'});
 assert.equal(events.at(-1).phase,'not_needed');assert.equal(JSON.stringify(events).includes('secret'),false);
 const failed=[];
 const blocked=createNativeActions({evaluate:async()=>({status:'blocked',reason:'input_not_focused'}),cdp:async()=>assert.fail('no dispatch')},{expectedUrl,onAction:e=>failed.push(e)});
 await assert.rejects(blocked.fill({actionId:'fill',selector:'#keyword',label:'关键词输入框',value:'private'}),/输入框未获得焦点/);
 assert.match(failed.at(-1).description,/关键词输入框.*本动作未发出.*输入框未获得焦点/);
});

test('a rerendered input may receive native focus once after its own click, without another click',async()=>{
 const events=[],calls=[];let focused=false,value='',clicked=false;
 const actions=createNativeActions({evaluate:async(_fn,args)=>{
  if(args.purpose==='click')return ready;
  if(!focused)return {status:'blocked',reason:'input_not_focused',documentFocused:true};
  return {...ready,value,inputType:'text',selectionStart:0,selectionEnd:value.length};
 },cdp:async(method,args)=>{
  calls.push(method);
  if(method==='Input.dispatchMouseEvent')clicked=true;
  if(method==='DOM.getDocument')return {root:{nodeId:1}};
  if(method==='DOM.querySelectorAll')return {nodeIds:[2]};
  if(method==='DOM.focus'){assert.equal(clicked,true);focused=true;}
  if(method==='Input.insertText')value=args.text;
 }},{expectedUrl,onAction:e=>events.push(e)});
 await actions.click({actionId:'click',selector:'#keyword',label:'关键词输入框'});
 await actions.fill({actionId:'fill',selector:'#keyword',label:'关键词输入框',value:'synthetic'});
 assert.equal(value,'synthetic');assert.equal(calls.filter(x=>x==='DOM.focus').length,1);
 assert.equal(calls.filter(x=>x==='Input.dispatchMouseEvent').length,3);
 assert.ok(events.some(e=>e.description.includes('输入焦点移到“关键词输入框”')));
});
test('focus recovery refuses a different control, background document, and unresolved focus',async()=>{
 for(const scenario of ['different','background','unresolved']){
  const calls=[];
  const actions=createNativeActions({evaluate:async(_fn,args)=>args.purpose==='click'?ready:{status:'blocked',reason:'input_not_focused',documentFocused:scenario!=='background'},cdp:async(method)=>{
   calls.push(method);if(method==='DOM.getDocument')return {root:{nodeId:1}};if(method==='DOM.querySelectorAll')return {nodeIds:[2]};
  }},{expectedUrl,onAction:()=>{}});
  await actions.click({actionId:'click',selector:'#keyword'});
  await assert.rejects(actions.fill({actionId:'fill',selector:scenario==='different'?'#other':'#keyword',value:'synthetic'}),e=>e.reason==='input_not_focused');
  assert.equal(calls.filter(x=>x==='DOM.focus').length,scenario==='unresolved'?1:0);
  assert.ok(!calls.includes('Input.insertText'));
 }
});

test('mouse timing logs distinguish sends, acknowledgments and unknown results without replay',async()=>{
 for(const failedType of [null,'mousePressed']) {
  const events=[],sent=[];
  const actions=createNativeActions({evaluate:async()=>ready,cdp:async(_method,args)=>{
   sent.push(args.type);if(args.type===failedType)throw Error('lost response');
  }},{expectedUrl,onAction:e=>events.push(e)});
  const attempt=actions.click({...action,label:'关键词输入框'});
  if(failedType)await assert.rejects(attempt,e=>e.outcome==='unknown');else await attempt;
  const expected=failedType?['mouseMoved','mousePressed']:['mouseMoved','mousePressed','mouseReleased'];
  assert.deepEqual(sent,expected);
  assert.deepEqual(events.filter(e=>e.phase==='input_sending').map(e=>e.inputType),expected);
  for(const e of events.filter(e=>['input_acknowledged','input_unknown'].includes(e.phase))) {
   assert.equal(e.timingSource,'client-command-roundtrip');assert.ok(e.roundTripMs>=0);
   assert.match(e.description,/鼠标/);
  }
  assert.equal(events.filter(e=>e.phase==='input_unknown').length,failedType?1:0);
 }
});
test('inspector distinguishes ancestor clipping from unrelated overlay',()=>{
 const clipped=inspect({modify:(c,e)=>{
  e.parentElement={clientLeft:0,clientTop:0,clientWidth:200,clientHeight:50,getBoundingClientRect:()=>({x:0,y:0,width:200,height:50})};
  c.getComputedStyle=el=>({visibility:'visible',display:'block',opacity:'1',overflowY:el===e?'visible':'auto'});
 }});assert.equal(clipped.reason,'target_clipped_by_container');
 assert.equal(inspect({modify:c=>{c.document.elementFromPoint=()=>({});}}).reason,'target_covered');
});
for(const recovered of [true,false])test(`clipped click repositions once before dispatch; recovered=${recovered}`,async()=>{
 let reads=0;const calls=[];
 const page={evaluate:async()=>++reads>1&&recovered?{status:'ready',url:expectedUrl,x:120,y:200}:{status:'blocked',reason:'target_clipped_by_container'},cdp:async(method,args)=>{calls.push([method,args]);if(method==='DOM.getDocument')return {root:{nodeId:1}};if(method==='DOM.querySelectorAll')return {nodeIds:[2]};}};
 const actions=createNativeActions(page,{expectedUrl});
 if(recovered)await actions.click(action);else await assert.rejects(actions.click(action),e=>e.reason==='target_clipped_by_container'&&e.outcome==='not_started');
 assert.equal(calls.filter(x=>x[0]==='DOM.scrollIntoViewIfNeeded').length,1);
 assert.equal(calls.filter(x=>x[0]==='Input.dispatchMouseEvent').length,recovered?3:0);
 assert.equal(reads,2);
});
