import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionEntries,unclassifiedSegments} from '../lib/platform-sections.mjs';
test('explicit dates separate experiences without losing lines or inventing roles',()=>{
 const text='工作经历\n甲公司\n（2021.06 - 至今, 5年4个月）\n工程师\n职责：开发\n乙公司\n（2019.07 - 2020.01, 6个月）\n负责测试';
 const entries=sectionEntries({text});assert.equal(entries.length,3);assert.equal(entries[1].title,'甲公司');assert.equal(entries[2].title,'乙公司');assert.equal(entries.map(e=>e.text).join('\n'),text);
});
test('ambiguous prose stays intact',()=>{const text='参与2020年项目，2019-2022负责研发';assert.deepEqual(sectionEntries({text}),[{title:'未自动拆分',period:null,text}]);});
test('unclassified header and footer remain visible alongside verified sections',()=>{
 const text='合成基本资料\n工作经历\n甲公司\n职责\n附件简历\n不可见附件提示';
 assert.deepEqual(unclassifiedSegments({text,sections:[{heading:'工作经历',text:'甲公司\n职责',startLine:3,endLine:4}]}),[
  {startLine:1,endLine:1,text:'合成基本资料'},{startLine:5,endLine:6,text:'附件简历\n不可见附件提示'},
 ]);
});
test('stale or missing section offsets never suppress raw text',()=>{
 const text='工作经历\n甲公司';
 for(const section of [{heading:'工作经历',text:'乙公司',startLine:2,endLine:2},{heading:'工作经历',text:'甲公司'}]){
  assert.deepEqual(unclassifiedSegments({text,sections:[section]}),[{startLine:1,endLine:2,text}]);
 }
});
