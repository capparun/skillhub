import test from 'node:test';import assert from 'node:assert/strict';import {createFavoriteGroup} from '../lib/favorite-group.js';
const args={file:'synthetic',operationId:'group-one',name:'项目组',payload:{name:'项目组',parent:'我的收藏'}};
function fixture(states){let i=0;const actions=[];return {actions,deps:{execute:async(f,r,work)=>{assert.equal(r.kind,'favorite-group-create');return (await work()).evidence;},pause:async()=>{},openDriver:async()=>({inspect:async()=>states[Math.min(i++,states.length-1)],act:async(...a)=>actions.push(a)})}};}
test('explicit creation selects root, fills observed editor and verifies persisted group',async()=>{
 const f=fixture([{known:true,saved:false,favorite:'#favorite'},{known:true,popup:true,add:'#add'},{known:true,popup:true,input:'#name',value:'',save:'#save'},{known:true,popup:true,input:'#name',value:'项目组',save:'#save'},{known:true,popup:true,exists:true}]);
 const result=await createFavoriteGroup(args,f.deps);assert.equal(result.created,true);assert.equal(result.groupVerified,true);assert.deepEqual(f.actions,[['click','#favorite'],['click','#add'],['fill','#name','项目组'],['click','#save']]);
});
test('existing group is reused without creation',async()=>{const f=fixture([{known:true,popup:true,exists:true}]);assert.equal((await createFavoriteGroup(args,f.deps)).created,false);assert.equal(f.actions.length,0);});
test('unknown editor never submits guessed key or save',async()=>{const f=fixture([{known:true,popup:true,add:'#add'},{known:true,popup:true,editorHtml:'<synthetic>'}]);const r=await createFavoriteGroup(args,f.deps);assert.equal(r.createSubmitted,false);assert.deepEqual(f.actions,[['click','#add']]);});
test('unconfirmed creation stays unknown and cannot claim success',async()=>{const f=fixture([{known:true,popup:true,input:'#name',save:'#save'},{known:true,popup:true,input:'#name',value:'项目组',save:'#save'},{known:true,popup:true,exists:false}]);const r=await createFavoriteGroup(args,f.deps);assert.equal(r.createSubmitted,true);assert.equal(r.reason,'group_creation_not_confirmed');assert.equal(r.groupVerified,undefined);});
test('root hover reveals add control without clicking a hidden target',async()=>{
 const f=fixture([{known:true,popup:true,root:'#root'},{known:true,popup:true,root:'#root',add:'#add'},{known:true,popup:true,input:'#name',value:'',save:'#save'},{known:true,popup:true,input:'#name',value:'项目组',save:'#save'},{known:true,popup:true,exists:true}]);
 const r=await createFavoriteGroup(args,f.deps);assert.equal(r.created,true);assert.deepEqual(f.actions,[['hover','#root'],['click','#add'],['fill','#name','项目组'],['click','#save']]);
});
