import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {compile,operations} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/linkedin/gateway.mjs';
const contracts=JSON.parse(fs.readFileSync(new URL('../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/linkedin/operation-contracts.json',import.meta.url))).operations;
const account={profile:'fixture',expected_identity:'Fixture',expected_profile_url:'https://www.linkedin.com/in/fixture/'};
const values={keyword:'engineer',cursor:'/tmp/cursor.json',profile_url:'https://www.linkedin.com/in/candidate/',company:'example',limit:10,max_pages:1,location:'Singapore',connection:'2nd',currentCompany:'1',pastCompany:'2',school:'3',industry:'Software',language:'English',anonymousPolicy:'stop'};
test('contracts cover every ordinary gateway operation and compile declared inputs',()=>{
 assert.deepEqual(contracts.map(c=>c.operation).sort(),Object.keys(operations.linkedin).sort());
 for(const c of contracts){
 const input=Object.fromEntries(Object.keys(c.request.input.properties).map(k=>[k,values[k]]));
 const request={provider:'linkedin',operation:c.operation,account,input};
 assert.doesNotThrow(()=>compile(request,{linkedinEntry:'/tmp/product.mjs'}));
 assert.throws(()=>compile({...request,input:{...input,unexpected:true}},{linkedinEntry:'/tmp/product.mjs'}),{code:'unsupported_parameter'});
 for(const key of c.request.input.required){const partial={...input};delete partial[key];assert.throws(()=>compile({...request,input:partial},{linkedinEntry:'/tmp/product.mjs'}));}
 }
});
import {normalize} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/linkedin/gateway.mjs';
test('declared output envelope matches normalized responses for all ordinary operations',()=>{
 for(const c of contracts){
 const input=Object.fromEntries(Object.keys(c.request.input.properties).map(k=>[k,values[k]]));
 const data=c.operation==='account.inspect'?{logged_in:true,name:'Fixture',public_id:'fixture'}:c.operation==='company.read'?[{name:'Example',url:'https://www.linkedin.com/company/example/'}]:[{name:'Candidate',profile_url:values.profile_url,about:'Synthetic',experience:'Synthetic'}];
 const result=normalize({provider:'linkedin',operation:c.operation,input,account},{ok:true,data});
 for(const key of c.output.required)assert.ok(Object.hasOwn(result,key),c.operation+': '+key);
 assert.ok(c.output.status.includes(result.status));assert.equal(result.qualification,'not_evaluated');
 }
});
