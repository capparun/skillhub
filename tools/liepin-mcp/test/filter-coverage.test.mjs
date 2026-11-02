import test from 'node:test';
import assert from 'node:assert/strict';
import {filterCoverage} from '../scripts/filter-coverage.mjs';
test('coverage counts completed field readbacks, not declarations or partial progress',()=>{
 const report=filterCoverage([{operations:[
  {kind:'prepare',operationId:'ok',status:'completed',evidence:{applied:[{field:'keyword',value:'开发'},{field:'keyword',value:'开发'},{field:'nonexistent',value:'x'}]}},
  {kind:'prepare',operationId:'failed',status:'failed',evidence:{applied:[{field:'education',value:'本科'}]}},
  {kind:'prepare',operationId:'progress',status:'failed',filterProgress:{checked:[{field:'city',value:'上海'}]}},
  {kind:'inspect',status:'completed',evidence:{applied:[{field:'gender',value:'不限'}]}},
 ]}]);
 assert.equal(report.total,30);assert.equal(report.covered,1);
 assert.equal(report.fields.find(f=>f.key==='education').incompleteReadbacks.length,1);
 assert.equal(report.fields.find(f=>f.key==='city').completedReadbacks.length,0);
});
