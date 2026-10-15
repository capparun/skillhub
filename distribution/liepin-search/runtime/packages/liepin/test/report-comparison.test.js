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
