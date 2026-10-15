import test from 'node:test';
import assert from 'node:assert/strict';
import {candidatePresentation} from '../lib/report-presentation.js';

test('reader presentation uses saved list identity and latest readable detail, not failed page text', () => {
  const row = {key:'liepin:internal', observations:[
    {stage:'list',data:{name:'合成候选人',city:'上海',summary:'嵌入式项目经验'}},
    {stage:'detail',data:{status:'partial',sections:[{heading:'项目经历',text:'合成项目证据'}]}},
    {stage:'detail',data:{status:'blocked',title:'访问限制',sections:[{heading:'错误页面',text:'不能展示'}]}},
  ]};
  const result = candidatePresentation(row);
  assert.equal(result.name,'合成候选人');
  assert.equal(result.company,'');
  assert.equal(result.detailStatus,'已读取部分可见详情');
  assert.deepEqual(result.sections,[{heading:'项目经历',text:'合成项目证据'}]);
});

test('missing profile stays unknown instead of displaying an internal key as a name', () => {
  const result = candidatePresentation({key:'liepin:internal',observations:[]});
  assert.equal(result.name,'姓名待确认');
  assert.equal(result.detailStatus,'未读取可用详情');
});
