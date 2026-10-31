import test from 'node:test';
import assert from 'node:assert/strict';
import {withAdapterDeadline} from '../lib/site-adapter-deadline.mjs';
test('deadline after dispatched action prevents later click and aborts shared signal',async()=>{
 let clock=0,calls=0,signal;
 const tab={id:123,async act(){calls++;clock=101;}};
 const run=withAdapterDeadline(async ctx=>{
  signal=ctx.signal;assert.equal(ctx.tab.id,123);
  try{await ctx.tab.act('first');}catch{}
  await ctx.tab.act('second');
 },{timeoutMs:100,now:()=>clock});
 await assert.rejects(run({tab}),/执行时限/);
 assert.equal(calls,1);assert.equal(signal.aborted,true);
});
test('caller cancellation prevents any browser dispatch',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(withAdapterDeadline(ctx=>ctx.tab.act())({signal:controller.signal,tab:{act(){calls++;}}}),/取消/);
 assert.equal(calls,0);
});
test('public tab methods retain receiver and successful results',async()=>{
 const tab={id:42,async url(){return String(this.id);}};
 assert.equal(await withAdapterDeadline(ctx=>ctx.tab.url())({tab}),'42');
});
