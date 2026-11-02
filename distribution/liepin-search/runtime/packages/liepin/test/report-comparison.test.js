import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonTable} from '../lib/report-comparison.js';

test('comparison separates unknown identities and never lists exclusion support as a positive', () => {
  const html = comparisonTable([
    {identityStatus:'identified',presentation:{name:'合成<img>',city:'上海',detailStatus:'部分详情'},findings:[
      {kind:'exclusion',status:'supported',label:'职责冲突',reason:'已有证据'},
      {kind:'required',status:'unknown',label:'项目经验',reason:'待核实'},
    ]},
    {identityStatus:'unresolved',presentation:{name:'未确认'},findings:[]},
  ]);
  assert.match(html,/已评估 1 人；待评估 0 人/);
  assert.match(html,/1 条身份待确认记录/);
  assert.match(html,/尚无已记录的支持证据/);
  assert.match(html,/职责冲突：已有证据/);
  assert.ok(!html.includes('<img>'));
  assert.ok(!html.includes('>未确认</a>'));
});

test('static comparison omits empty assessment and ranking columns but preserves evidence gaps',()=>{
 const row={identityStatus:'identified',presentation:{name:'合成人员',position:'工程师',company:'合成公司',city:'上海',detailStatus:'部分详情'},findings:[],evidenceGaps:[]};
 const plain=comparisonTable([row],{interactive:false});
 assert.ok(!plain.includes('<th>复核顺序</th>'));
 assert.ok(!plain.includes('<th>已有支持证据</th>'));
 assert.match(plain,/<strong>工程师<\/strong>/);
 const gaps=comparisonTable([{...row,evidenceGaps:['合成待核实项']}],{interactive:false});
 assert.match(gaps,/<th>待核实与冲突<\/th>/);assert.match(gaps,/合成待核实项/);
 const ranked=comparisonTable([{...row,reviewOrder:1}],{interactive:false});
 assert.match(ranked,/<th>复核顺序<\/th>/);
});
