import test from 'node:test';
import assert from 'node:assert/strict';
import {validateOrdinaryFilters,ordinaryFilterContract} from '../lib/ordinary-filter-contract.js';
import {getPeopleSearchUrl} from '../lib/linkedin-urls.js';
test('invalid company/school mixtures and unknown relationship values never silently disappear',()=>{
 for(const field of ['currentCompany','pastCompany','school']){
  for(const value of ['Microsoft','123,company','123,,456'])assert.throws(()=>validateOrdinaryFilters({keyword:'engineer',[field]:value}),{code:'invalid_'+field+'_ids'});
 }
 assert.throws(()=>validateOrdinaryFilters({keyword:'engineer',connection:'2nd,invalid'}),{code:'invalid_connection'});
 assert.doesNotThrow(()=>validateOrdinaryFilters({keyword:'engineer',currentCompany:'123,456',connection:'1st,3rd+'}));
});
test('consumer keyword enhancement is explicitly approximate, not native location/industry/language',()=>{
 const input={keyword:'engineer',location:'Singapore',industry:'Medical Devices',language:'English'};
 const c=ordinaryFilterContract(input,{consumer:true,searchUrl:'https://www.linkedin.com/search/results/people/?keywords=engineer%20Singapore%20Medical%20Devices%20English'});
 assert.equal(c.applications.filter(x=>x.method==='keyword_expansion').length,3);
 assert.ok(c.applications.every(x=>x.exact_field_filter===false));
});
test('native URL encoding stays distinct from independently verified selection',()=>{
 const input={keyword:'engineer',connection:'2nd',currentCompany:'123',pastCompany:'456',school:'789'};
 const searchUrl=getPeopleSearchUrl('free',{forceConsumer:true,keyword:'engineer',connection:input.connection,currentCompanyIds:['123'],pastCompanyIds:['456'],schoolIds:['789']});
 const c=ordinaryFilterContract(input,{consumer:true,searchUrl});
 for(const a of c.applications.filter(x=>x.field!=='keyword')){assert.equal(a.method,'native_query_parameter');assert.equal(a.exact_field_filter,null);assert.equal(a.selection_state,'not_independently_observed');}
 assert.equal(JSON.parse(c.applications.find(x=>x.field==='connection').encoded_value)[0],'S');
});
test('unresolved and UI-only fields never claim exact application',()=>{
 const c=ordinaryFilterContract({keyword:'engineer',location:'Example'},{consumer:false,searchUrl:'https://www.linkedin.com/search/results/people/?keywords=engineer',uiResolved:['location=Example']});
 assert.equal(c.applications[1].method,'ui_selection_requested');assert.equal(c.applications[1].exact_field_filter,false);
 const missing=ordinaryFilterContract({keyword:'engineer',language:'Example'},{consumer:false,searchUrl:'https://www.linkedin.com/search/results/people/?keywords=engineer'});
 assert.equal(missing.applications[1].method,'not_confirmed');
});
