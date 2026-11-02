import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserClient} from '../lib/client.mjs';
test('close rejects a user tab without any browser call',async()=>{
 const client=new BrowserClient();client.js=()=>assert.fail('must not reach browser');
 await assert.rejects(client.tab('123').close(),/本会话/);
});
test('owned page can be closed once and ownership is released only after acknowledgement',async()=>{
 const client=new BrowserClient();let calls=0;client.js=async()=>{calls++;return {closed:true};};
 const tab=client.claimOpenedTab('123');await tab.close();assert.equal(calls,1);
 await assert.rejects(tab.close(),/本会话/);assert.equal(calls,1);
});
test('failed cleanup keeps ownership for later inspection',async()=>{
 const client=new BrowserClient();client.js=async()=>{throw Error('connection lost');};
 await assert.rejects(client.claimOpenedTab('123').close());assert.equal(client.ownedTabs.has('123'),true);
});
test('activating parent requires matching active metadata after update',async()=>{
 const client=new BrowserClient();const calls=[];
 client.js=async code=>{calls.push(code);return calls.length===1?{}:{id:123,active:true};};
 await client.tab('123').activate();assert.equal(calls.length,2);assert.match(calls[0],/tabs.update/);assert.match(calls[1],/tabs.get/);
 client.js=async()=>({id:124,active:true});await assert.rejects(client.tab('123').activate(),/未确认/);
});
test('unsafe numeric IDs cannot target a rounded Chrome tab',()=>{
 const client=new BrowserClient();assert.throws(()=>client.tab('9007199254740993'));assert.throws(()=>client.claimOpenedTab('9007199254740993'));
});

import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
function peer(){
 const child=new EventEmitter(),requests=[];child.stdout=new PassThrough();child.stderr=new PassThrough();
 child.stdin=new Writable({write(chunk,encoding,done){const message=JSON.parse(chunk.toString());requests.push(message);if(message.method==='initialize')queueMicrotask(()=>child.stdout.write(JSON.stringify({id:message.id,result:{protocolVersion:'2024-11-05'}})+'\n'));done();}});
 child.kill=()=>{child.emit('exit',0);child.stdout.end();child.stderr.end();};return {child,requests};
}
test('response timeout fails the session and late results cannot permit replay',async()=>{
 const {child,requests}=peer(),client=new BrowserClient('/synthetic',{spawnProcess:()=>child,requestTimeoutMs:20});
 try{
  await client.start();await assert.rejects(client.rpc('tools/call',{name:'synthetic'}),/效果未知/);
  const sent=requests.length;child.stdout.write(JSON.stringify({id:client.sequence,result:{ok:true}})+'\n');
  await assert.rejects(client.rpc('tools/call',{}),/超时/);assert.equal(requests.length,sent);assert.equal(client.pending.size,0);
 }finally{client.close();}
});
test('process exit settles all pending requests and rejects future dispatch',async()=>{
 const {child,requests}=peer(),client=new BrowserClient('/synthetic',{spawnProcess:()=>child});
 await client.start();const a=client.rpc('a',{}),b=client.rpc('b',{});const settled=Promise.all([assert.rejects(a,/退出/),assert.rejects(b,/退出/)]);
 child.emit('exit',1);await settled;const sent=requests.length;await assert.rejects(client.rpc('c',{}),/退出/);assert.equal(requests.length,sent);client.close();
});
test('stdin errors reject requests without an unhandled stream exception',async()=>{
 const {child}=peer(),client=new BrowserClient('/synthetic',{spawnProcess:()=>child});await client.start();
 const pending=assert.rejects(client.rpc('a',{}),/synthetic pipe/);child.stdin.emit('error',Error('synthetic pipe'));await pending;client.close();
});
test('large snapshots are read once and transferred losslessly from host memory',async()=>{
 const client=new BrowserClient(),value={text:'合成"\\\n'.repeat(40000)},serialized=JSON.stringify(value);let reads=0,cleared=false;
 client.js=async code=>{
  if(code.startsWith('let __hunterSnapshot')){reads++;return {length:serialized.length,chunk:serialized.slice(0,40000)};}
  if(code.endsWith('=null')){cleared=true;return null;}
  const offsets=code.match(/\.slice\((\d+),(\d+)\)/);assert.ok(offsets);return serialized.slice(Number(offsets[1]),Number(offsets[2]));
 };
 assert.deepEqual(await client.capture('syntheticRead()'),value);assert.equal(reads,1);assert.equal(cleared,true);
});
test('truncated upstream results never masquerade as complete data or leak previews',async()=>{
 const client=new BrowserClient();client.rpc=async()=>({content:[{type:'text',text:JSON.stringify({truncated:true,preview:'private synthetic text',chars:200000})}]});
 await assert.rejects(client.js('synthetic'),error=>error.code==='MCP_RESULT_TRUNCATED'&&!error.message.includes('private'));
});
test('missing snapshot chunk fails closed and clears captured host data',async()=>{
 const client=new BrowserClient();let cleared=false;
 client.js=async code=>code.startsWith('let ')?{length:50000,chunk:'x'.repeat(40000)}:code.endsWith('=null')?(cleared=true,null):'';
 await assert.rejects(client.capture('synthetic'),/分块不完整/);assert.equal(cleared,true);
});
