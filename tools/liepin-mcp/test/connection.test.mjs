import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {existingTabs,bindExisting} from '../lib/connection.mjs';
import {diagnose} from '../lib/diagnostics.mjs';
import {createTask,readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-bind-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('tab inventory filters unsupported URLs and drops titles',async()=>{
 const rows=await existingTabs({verify:async()=>{},existingTabs:async()=>[{tabId:1,url:'https://h.liepin.com/search/getConditionItem',title:'private'},{tabId:2,url:'https://example.com'},{tabId:3,url:'https://h.liepin.com/resume/showresumedetail/?res_id_encode=a&res_id_encode=b'}]});
 assert.equal(rows.length,1);assert.equal(rows[0].view,'search');assert.equal(rows[0].title,undefined);
});
test('binding existing tab persists user ownership without creating a page',async t=>{
 const file=path.join(fixture(t),'task.json');createTask(file);const expected_url='https://h.liepin.com/search/getConditionItem';let claims=0;
 const result=await bindExisting({verify:async()=>{},claimExisting:async(id,url)=>{claims++;assert.equal(url,expected_url);return {id};}},{file,tab_id:'123',expected_url});
 assert.equal(result.created,false);assert.equal(claims,1);assert.equal(readTask(file).mcpBindings[0].ownership,'user');
 let connects=0;await assert.rejects(bindExisting({verify:async()=>{connects++;}},{file,tab_id:'123',expected_url:'https://example.com'}));assert.equal(connects,0);
});
test('doctor distinguishes local files from browser and business readiness',t=>{
 const root=fixture(t),bin=path.join(root,'cli.js');fs.writeFileSync(bin,'#!/usr/bin/env node\n');fs.chmodSync(bin,0o700);fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'opencli-mcp',version:'0.0.30'}));
 const report=diagnose({command:bin});assert.equal(report.status,'local-prerequisites-ready');assert.equal(report.browser.checked,false);assert.equal(report.business.checked,false);
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'opencli-mcp',version:'999'}));assert.equal(diagnose({command:bin}).status,'local-prerequisites-failed');
 assert.equal(diagnose({command:'/nonexistent'}).checks.find(c=>c.name==='command').ok,false);
});
