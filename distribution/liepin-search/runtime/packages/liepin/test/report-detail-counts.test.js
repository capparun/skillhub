import test from 'node:test';import assert from 'node:assert/strict';import{taskSummary}from '../lib/report.js';
test('detail statistics use latest snapshots and distinguish partial from readable',()=>{
 const candidate=(statuses)=>({source:'liepin',observations:statuses.map(status=>({stage:'detail',data:{status}}))});
 const task={requirements:{criteria:[]},candidates:[candidate(['readable']),candidate(['partial']),candidate(['readable','unavailable'])]};
 const summary=taskSummary(task);assert.deepEqual(summary.detailStatuses,{readable:1,partial:1,other:1});assert.equal(summary.readableDetails,2);
});
