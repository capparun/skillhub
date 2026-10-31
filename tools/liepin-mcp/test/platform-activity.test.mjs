import test from 'node:test';import assert from 'node:assert/strict';
import {platformActivity} from '../lib/platform-activity.mjs';
test('completed empty favorites supersedes older rows; failed reads do not replace the snapshot',()=>{
 const operations=[
  {status:'completed',evidence:{total:1,rows:[{collection:'favorites',name:'合成',summary:'旧快照'}]}},
  {status:'completed',evidence:{collection:'favorites',total:0,rows:[]}},
  {status:'blocked',evidence:{collection:'favorites',total:3,rows:[{name:'无效'}]}},
 ];
 const result=platformActivity({operations});
 assert.equal(result.favoritesRead,true);assert.equal(result.favoritesTotal,0);assert.deepEqual(result.favorites,[]);
 assert.equal(platformActivity({operations:[{status:'completed',evidence:{rows:[],total:0}}]}).favoritesRead,false);
});
test('failed writes do not imply saved state and unread differs from empty',()=>{
 const a=platformActivity({operations:[{kind:'favorite',status:'unknown',evidence:{resumeId:'a',saved:true}},{kind:'inspect',status:'completed',evidence:{schemes:[]}}]});
 assert.equal(a.schemesRead,true);assert.deepEqual(a.schemes,[]);assert.equal(a.favoritesRead,false);assert.equal(a.favoriteActions[0][3],'结果未确认');
});
test('batches preserve incomplete items and only completed items count as done',()=>{
 const a=platformActivity({detailBatches:[{id:'b',status:'paused',items:[{observationId:'a',status:'completed'},{observationId:'b',status:'pending'}]}]});assert.equal(a.batches[0].completed,1);assert.equal(a.batches[0].total,2);assert.equal(a.batches[0].items[1][1],'pending');
});
