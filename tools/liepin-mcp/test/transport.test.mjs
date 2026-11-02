import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPageFacade,assertLiepinUrl,createMcpSearchDriver} from '../lib/transport.mjs';
import {patchBackground} from '../build-extension.mjs';
test('serializes observer argument using MCP arg contract',async()=>{let got;const f=createPageFacade({evaluate:async(fn,opts)=>{got=opts;return {ok:true};}});await f.evaluate(()=>0,{limit:3});assert.deepEqual(got,{arg:{limit:3}});});
test('unknown action outcome stops subsequent writes without replay',async()=>{let calls=0;const f=createPageFacade({act:async()=>{calls++;throw Error('command_outcome_unknown');}});await assert.rejects(f.action('click','#a'));await assert.rejects(f.action('click','#a'),/停止/);assert.equal(calls,1);});
test('blank page stops subsequent reads',async()=>{let calls=0;const f=createPageFacade({evaluate:async()=>{calls++;return {url:'about:blank'};}});await assert.rejects(f.evaluate(()=>0),{code:'LIEPIN_UNEXPECTED_BLANK_PAGE'});await assert.rejects(f.evaluate(()=>0));assert.equal(calls,1);});
test('abort blocks dispatch',async()=>{const c=new AbortController();c.abort();const f=createPageFacade({act:async()=>assert.fail()},{signal:c.signal});await assert.rejects(f.action('click','#a'));});
test('identity requires exact origin and path',()=>{assert.throws(()=>assertLiepinUrl('https://h.liepin.com.evil/search/getConditionItem','/search/getConditionItem'));assert.throws(()=>assertLiepinUrl('https://u:p@h.liepin.com/search/getConditionItem','/search/getConditionItem'));assert.equal(assertLiepinUrl('https://h.liepin.com/search/getConditionItem#session','/search/getConditionItem').hostname,'h.liepin.com');});
test('unknown upstream build cannot silently receive patch',()=>assert.throws(()=>patchBackground('changed upstream'),/哈希/));
test('unreviewed CDP methods never reach browser',async()=>{const f=createPageFacade({cdp:{send:async()=>assert.fail()}});await assert.rejects(f.cdp('Runtime.enable',{}),/只允许/);});
test('cancellation during a browser action prevents subsequent actions',async()=>{
 const controller=new AbortController();let calls=0;
 const facade=createPageFacade({act:async()=>{calls++;controller.abort();return {delivery:'received'};}},{signal:controller.signal});
 await assert.rejects(facade.action('click','#synthetic'),/取消/);
 await assert.rejects(facade.action('click','#synthetic'),/停止/);assert.equal(calls,1);
});

test('search scrolling uses the official action shape and user-facing logs',async()=>{
 const calls=[],logs=[];
 const driver=createMcpSearchDriver({url:async()=> 'https://h.liepin.com/search/getConditionItem',act:async request=>{calls.push(request);return {delivery:'received'};}},{expectedUrl:'https://h.liepin.com/search/getConditionItem',onAction:event=>logs.push(event)});
 await driver.scroll('down',320);
 assert.deepEqual(calls,[{action:'scroll',direction:'down',amount:320}]);
 assert.ok(logs.some(event=>event.phase==='dispatching'&&event.description.includes('向下滚动页面 320 像素')));
});
test('invalid scroll and changed page stop before dispatch',async()=>{
 const facade=createPageFacade({act:async()=>assert.fail('must not dispatch')});
 await assert.rejects(facade.scroll('down',Infinity),/距离无效/);
 const driver=createMcpSearchDriver({url:async()=> 'about:blank',act:async()=>assert.fail('must not dispatch')},{expectedUrl:'https://h.liepin.com/search/getConditionItem'});
 await assert.rejects(driver.scroll('down',320),/页面地址/);
});
test('scroll failure never retries or permits a following action',async()=>{
 let calls=0;const facade=createPageFacade({act:async()=>{calls++;throw Error('command_outcome_unknown');}});
 await assert.rejects(facade.scroll('down',320),/unknown/);
 await assert.rejects(facade.action('click','#control'),/停止/);assert.equal(calls,1);
});

test('Escape targets the page body as required by the upstream press contract',async()=>{
 let sent;const driver=createMcpSearchDriver({url:async()=> 'https://h.liepin.com/search/getConditionItem',act:async request=>{sent=request;return {}; }},{expectedUrl:'https://h.liepin.com/search/getConditionItem'});
 await driver.pressKey('Escape');assert.deepEqual(sent,{action:'press',target:{selector:'body'},value:'Escape'});
});
test('native input logs describe user actions and do not imply verification or expose input text',async()=>{
 const events=[];const facade=createPageFacade({cdp:{send:async()=>({})}},{onAction:e=>events.push(e)});
 await facade.cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:12,y:34});
 await facade.cdp('Input.insertText',{text:'private input'});
 assert.match(events[0].description,/按下鼠标，位置\(12, 34\)/);
 assert.deepEqual(events.map(e=>e.phase),['dispatching','returned','dispatching','returned']);
 assert.ok(events.every(e=>!e.description.includes('private input')));
 assert.ok(events.filter(e=>e.phase==='returned').every(e=>e.description.includes('待回读')));
});
