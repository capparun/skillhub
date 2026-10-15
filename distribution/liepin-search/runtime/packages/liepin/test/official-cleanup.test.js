import test from 'node:test';
import assert from 'node:assert/strict';
import {officialCleanupDriver} from '../lib/official-cleanup.js';
const parent='A'.repeat(32),child='B'.repeat(32),url='https://h.liepin.com/search/getConditionItem';
test('official driver restores parent preference before exact child close',async()=>{
 let selected=parent;const calls=[];
 const tabs=new Map([[parent,{page:parent,url}],[child,{page:child,url:'https://h.liepin.com/resume/showresumedetail/?res_id_encode=one'}]]);
 const manager={selectTab:async id=>{if(!tabs.has(id))throw new Error(`Page not found: ${id} — stale page identity`);selected=id;calls.push(['select',id]);},
  tabs:async()=>[tabs.get(selected)],closeTab:async id=>{assert.equal(selected,parent);calls.push(['close',id]);tabs.delete(id);}};
 const driver=officialCleanupDriver(manager,parent);
 await driver.checkParent(parent);assert.equal((await driver.inspect(child)).page,child);
 await driver.checkParent(parent);await driver.close(child);assert.equal(await driver.inspect(child),null);
 await driver.checkParent(parent);assert.ok(tabs.has(parent));assert.deepEqual(calls.filter(c=>c[0]==='close'),[['close',child]]);
});
test('timeouts and unrelated missing-target errors do not prove closure',async()=>{
 for(const message of ['timeout','Page not found: unrelated — stale page identity','Page is not in the automation container']){
  const driver=officialCleanupDriver({selectTab:async()=>{throw new Error(message);}},parent);
  await assert.rejects(driver.inspect(child),e=>e.message===message);
 }
});
test('changed search target is never accepted as cleanup parent',async()=>{
 const driver=officialCleanupDriver({selectTab:async()=>{},tabs:async()=>[{page:parent,url:'https://example.com/user'}]},parent);
 await assert.rejects(driver.checkParent(parent),/原搜索标签已变化/);
});
