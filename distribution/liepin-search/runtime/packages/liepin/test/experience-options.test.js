import test from 'node:test';
import assert from 'node:assert/strict';
import {plan} from '../lib/filters.js';

test('historical experience label and unitless request produce identical exact alternatives',()=>{
 for(const [a,b] of [['3-5','3-5 年'],['1-3','1-3年'],['10以上','10 年以上']]) {
  assert.deepEqual(plan({experience:a}).steps[0].choiceValues,plan({experience:b}).steps[0].choiceValues);
 }
 assert.deepEqual(plan({experience:'3-5'}).steps[0].choiceValues,['3-5','3-5年']);
});
test('experience alternatives do not widen ranges or alter other filter fields',()=>{
 assert.equal(plan({experience:'应届生'}).steps[0].choiceValues,undefined);
 assert.equal(plan({experience:'自定义'}).steps[0].choiceValues,undefined);
 assert.equal(plan({title:'3-5'}).steps[0].choiceValues,undefined);
 assert.ok(!plan({experience:'3-5'}).steps[0].choiceValues.includes('5-10年'));
});
