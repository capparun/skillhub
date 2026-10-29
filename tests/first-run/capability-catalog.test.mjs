import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const entry=process.env.INSTALLED_LINKEDIN_ENTRY;
test('installed catalog discovers commands without claiming live success',{skip:!entry},()=>{
 const r=spawnSync(process.execPath,[entry,'hunter-linkedin','capability-catalog','-f','json'],{encoding:'utf8',timeout:15000});
 assert.equal(r.status,0,r.stderr);const b=JSON.parse(r.stdout);assert.equal(b.ok,true);
 const rows=b.data.entries;assert.equal(new Set(rows.map(x=>x.command)).size,rows.length);
 for(const name of ['linkedin profile-read','hunter-linkedin task-continue','hunter-linkedin task-lock-inspect','hunter-linkedin profile-lock-inspect'])assert.ok(rows.some(r=>r.command===name),name);
 assert.ok(rows.every(r=>r.verification.live_execution==='not_checked'));
});
test('installed catalog selection and unknown command fail explicitly',{skip:!entry},()=>{
 const args=[entry,'hunter-linkedin','capability-catalog','--command'];
 const r=spawnSync(process.execPath,[...args,'linkedin profile-read','-f','json'],{encoding:'utf8',timeout:15000});assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).data.count,1);
 const bad=spawnSync(process.execPath,[...args,'linkedin nonexistent','-f','json'],{encoding:'utf8',timeout:15000});assert.notEqual(bad.status,0);assert.equal(JSON.parse(bad.stdout).ok,false);
});

test('profile locks are execution support, distinct from browser adapters',async()=>{
 const {capabilityCatalog}=await import('../../distribution/linkedin-only/runtime/packages/linkedin-workflow/capability-catalog.js');
 const registry=new Map(['profile-lock-inspect','profile-lock-recover'].map(name=>[name,{site:'hunter-linkedin',name,args:[]} ]));
 const result=capabilityCatalog(registry);
 assert.equal(result.count,2);
 for(const entry of result.entries){assert.equal(entry.layer,'execution_support');assert.ok(entry.direct_command_contract);}
});
