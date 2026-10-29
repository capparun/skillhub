import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const contracts=JSON.parse(readFileSync(new URL('../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/direct-command-contracts.json',import.meta.url))).contracts;
const host=process.env.OPENCLI_CONTRACT_HOST;
test('pinned profile normalizers expose documented output fields',{skip:!host},async()=>{
 for(const name of ['profile-read','profile-experience','profile-projects']){
  const {__test__:t}=await import(pathToFileURL(`${host}/clis/linkedin/${name}.js`));
  const fn=t.normalizeProfile??t.normalizeExperience??t.normalizeProject;
  const actual=fn({name:'Example',title:'Engineer',company:'Example Co',profile_url:'https://www.linkedin.com/in/example/'});
  const documented=contracts.find(c=>c.command===`linkedin ${name}`).output.fields;
  assert.deepEqual(Object.keys(actual).sort(),[...documented].sort(),name);
 }
});
test('direct contracts distinguish gateway wrappers and missing data',()=>{
 assert.equal(new Set(contracts.map(c=>c.command)).size,16);
 for(const c of contracts){assert.ok(c.preconditions.length);assert.ok(c.effects.length);assert.ok(c.errors.length);assert.ok(c.verification.live);assert.equal(c.output.product_json_path,'data');}
 for(const c of contracts.filter(c=>c.command.startsWith('linkedin profile-'))){assert.ok(c.output.missing);assert.equal(c.input['profile-url'].required,false);assert.ok(!c.output.fields.includes('coverage'));}
});

test('company contract matches pinned normalizer and distinguishes missing followers',{skip:!host},async()=>{
 const {__test__:t}=await import(pathToFileURL(`${host}/clis/linkedin/company.js`));
 const row=t.normalizeCompanyInfo({name:'Example'},'https://www.linkedin.com/company/example/about/');
 assert.deepEqual(Object.keys(row).sort(),contracts.find(c=>c.command==='linkedin company').output.fields.slice().sort());
 assert.equal(row.followers,0);assert.equal(row.industry,'');
 assert.throws(()=>t.normalizeCompanyInfo({name:'Example',followers:'invalid'},'https://www.linkedin.com/company/example/about/'));
});

test('connections contract matches pinned mapping, including missing timestamp',{skip:!host},async()=>{
 const {__test__:t}=await import(pathToFileURL(`${host}/clis/linkedin/connections.js`));
 const r=t.mapConnection({miniProfile:{publicIdentifier:'example',firstName:'Example'}},0);
 assert.deepEqual(Object.keys(r).sort(),contracts.find(c=>c.command==='linkedin connections').output.fields.slice().sort());
 assert.equal(r.connected_at,0);assert.equal(r.occupation,'');
 assert.throws(()=>t.mapConnection({miniProfile:{publicIdentifier:'invalid/id'}},0));
});
test('inbox contract preserves preview semantics and sorts recent conversations',{skip:!host},async()=>{
 const {__test__:t}=await import(pathToFileURL(`${host}/clis/linkedin/inbox.js`));
 const conv=(id,ms,text)=>({$type:'com.linkedin.messenger.Conversation',backendUrn:'urn:li:messagingThread:'+id,lastActivityAt:ms,title:id,descriptionText:text});
 const rows=t.parseConversations({included:[conv('old',1000,'x'),conv('new',2000,'y'.repeat(400))]},'');
 assert.equal(rows[0].thread_id,'new');assert.equal(rows[0].last_message_preview.length,300);
 const final={rank:1,thread_url:t.threadUrl(rows[0].thread_id),...rows[0]};
 assert.deepEqual(Object.keys(final).sort(),contracts.find(c=>c.command==='linkedin inbox').output.fields.slice().sort());
 assert.throws(()=>t.parseConversations({included:[conv('',1000,'x')]},''));
});
