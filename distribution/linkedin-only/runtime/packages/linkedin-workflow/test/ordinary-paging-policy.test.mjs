import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBudget,summarizeCoverage} from '../src/linkedin/task-policy.mjs';
const request={provider:'linkedin',operation:'person.search',input:{keyword:'engineer',limit:200,max_pages:2}};
test('ordinary page budget requires declared cap and reserves it before dispatch',()=>{
 const record={task:{budgets:{max_pages:3}},created_at:new Date().toISOString()};
 assert.doesNotThrow(()=>checkBudget(record,[],request));
 assert.throws(()=>checkBudget(record,[{request}],request),{code:'task_page_budget_exhausted'});
 assert.throws(()=>checkBudget(record,[],{...request,input:{keyword:'engineer'}}),{code:'page_budget_unsupported'});
});
test('ordinary true pagination can establish complete query coverage; old receipts stay unknown',()=>{
 const receipt={provider:'linkedin',operation:'person.search',data:{operation:'ordinary-people-search',query_fingerprint:'q',returned_count:20,completeness:'complete',truncated:false,pagination:{}}};
 assert.equal(summarizeCoverage([receipt]).complete,true);
 assert.equal(summarizeCoverage([{...receipt,data:{candidates:[]}}]).untracked,true);
 assert.equal(summarizeCoverage([{...receipt,data:{...receipt.data,completeness:'partial',cursor:'/tmp/cursor'}}]).complete,false);
});
