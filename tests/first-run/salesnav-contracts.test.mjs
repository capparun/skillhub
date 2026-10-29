import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {accountRead} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/account-read.mjs';
import {leadRead} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/lead-read.mjs';
import {search} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/search.mjs';
import {searchPage} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/pagination.mjs';
const contracts=JSON.parse(fs.readFileSync(new URL('../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/salesnav-contracts.json',import.meta.url))).contracts;
test('SalesNav catalog differentiates atomic reads from task orchestration',()=>{
 assert.equal(contracts.length,8);assert.equal(new Set(contracts.map(c=>c.command)).size,8);
 for(const c of contracts){assert.equal(c.layer,'platform_operation');assert.equal(c.verification.live,'not_checked_for_this_candidate');assert.ok(c.input.required.includes('expected_profile_url'));}
});
test('unknown fields fail before browser dispatch for search, continuation and detail primitives',async()=>{
 const transport=new Proxy({},{get(){assert.fail('must not dispatch browser operation');}});
 const input={unexpected:true};
 for(const action of [()=>accountRead(input,transport),()=>leadRead(input,transport),()=>search(input,'account',transport),()=>search(input,'lead',transport),()=>searchPage(input,transport)])await assert.rejects(action);
});
