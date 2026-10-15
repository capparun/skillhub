import test from 'node:test';
import assert from 'node:assert/strict';
import {readExpandedDetail,inspectExperienceExpanders} from '../lib/expanded-detail.js';
import {inspectDetail,parseDetail,detailUrl} from '../lib/detail.js';
for(const confirms of [true,false])test(`experience expansion saves visible content; confirms=${confirms}`,async()=>{
 let clicked=0;
 const target={selector:'#more',label:'显示其他2段项目经历'};
 const page={evaluate:async fn=>{
  if(fn===inspectExperienceExpanders)return clicked && confirms?[]:[target];
  assert.equal(fn,inspectDetail);
  return {url:detailUrl('fixture'),readyState:'complete',text:clicked && confirms?'项目经历\n第一段\n第二段\n第三段':'项目经历\n第一段\n显示其他2段项目经历'};
 }};
 const snapshot=await readExpandedDetail(page,'fixture',{pause:async()=>{},createActions:()=>({scrollTo:async()=>{},click:async()=>{clicked++;}})});
 const detail=parseDetail(snapshot,'fixture');assert.equal(clicked,1);
 if(confirms){assert.equal(detail.status,'readable');assert.match(detail.text,/第三段/);assert.equal(detail.expansion.expanded,1);}
 else {assert.equal(detail.status,'partial');assert.equal(detail.expansion.incomplete,true);assert.match(detail.warnings.join(' '),/未全部确认/);}
});
test('wrong identity or blocked content never creates an action sequence',async()=>{
 for(const snapshot of [{url:detailUrl('other'),readyState:'complete',text:'工作经历\n职责'},{url:detailUrl('fixture'),readyState:'complete',text:'安全验证'}]) {
  const result=await readExpandedDetail({evaluate:async()=>snapshot},'fixture',{createActions:()=>assert.fail('no actions')});assert.equal(result,snapshot);
 }
});
test('changed expansion target stops before clicking',async()=>{
 let inspections=0;
 const page={evaluate:async fn=>fn===inspectDetail?{url:detailUrl('fixture'),readyState:'complete',text:'工作经历\n职责\n显示其他1段工作经历'}:(++inspections===1?[{selector:'#more',label:'显示其他1段工作经历'}]:[])};
 await assert.rejects(readExpandedDetail(page,'fixture',{createActions:()=>({scrollTo:async()=>{},click:async()=>assert.fail('changed target')})}),/展开入口已变化/);
});
