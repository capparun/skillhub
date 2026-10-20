import test from 'node:test';import assert from 'node:assert/strict';
import {composeKeywordRounds} from '../lib/search-plan.mjs';
test('confirmed platform filters survive every keyword variation',()=>{
 const rows=composeKeywordRounds({keywords:['伺服算法','FOC'],platformFilters:{education:'本科及以上',experience:'5年以上',fullTime:'统招'},prefix:'servo'});
 assert.equal(rows.length,2);for(const r of rows){assert.equal(r.filters.experience,'5年以上');assert.equal(r.filters.education,'本科及以上');assert.equal(r.filters.fullTime,'统招');}
 // Values here are synthetic input, not claims about live UI option labels.
});
test('another role inherits only its own reviewed filters, never the previous JD',()=>{
 const [r]=composeKeywordRounds({keywords:['客户成功'],platformFilters:{city:'上海',experience:'3-5年'},prefix:'cs'});
 assert.equal(r.filters.city,'上海');assert.equal(r.filters.experience,'3-5年');assert.equal(r.filters.education,undefined);assert.equal(r.filters.fullTime,undefined);
});
test('query controls and invalid fields cannot silently override the plan',()=>{
 for(const platformFilters of [{keyword:'other'},{pages:3},{unknown:'x'}])assert.throws(()=>composeKeywordRounds({keywords:['a'],platformFilters}));
 assert.equal(composeKeywordRounds({keywords:['a','a']}).length,1);
});
test('degree and year buckets are separate coverage segments, not an invented inclusive option',async()=>{
 const {composeCoverageRounds}=await import('../lib/search-plan.mjs');
 const p=composeCoverageRounds({keywords:['伺服算法'],commonFilters:{fullTime:'统招本科'},segments:{experience:['5-10年','10年以上'],education:['本科','硕士','博士/博士后']},prefix:'case'});
 assert.equal(p.rounds.length,6);assert.equal(new Set(p.rounds.map(r=>`${r.filters.experience}/${r.filters.education}`)).size,6);assert.ok(p.rounds.every(r=>r.filters.fullTime==='统招本科'));assert.equal(p.coverage.complete,false);assert.equal(p.coverage.executedCombinations,0);
});
test('a different role has independent segment fields and preserves scope bounds',async()=>{
 const {composeCoverageRounds}=await import('../lib/search-plan.mjs');
 const p=composeCoverageRounds({keywords:['客户成功'],segments:{city:['上海','北京']},commonFilters:{experience:'3-5年'},prefix:'cs'});
 assert.equal(p.rounds.length,2);assert.ok(p.rounds.every(r=>r.filters.education===undefined));
 assert.throws(()=>composeCoverageRounds({keywords:['a','b'],segments:{city:['甲','乙','丙'],education:['本科','硕士']}}),/预算/);
 assert.throws(()=>composeCoverageRounds({keywords:['a'],segments:{city:['甲']},commonFilters:{city:'乙'}}),/冲突/);
});

test('coverage keywords must be an explicit array and whitespace duplicates do not consume rounds',async()=>{
 const {composeCoverageRounds}=await import('../lib/search-plan.mjs');
 for(const keywords of ['FOC',null,[],[42],[' ']])assert.throws(()=>composeCoverageRounds({keywords,segments:{city:['北京']}}),/关键词/);
 const p=composeCoverageRounds({keywords:[' FOC ','FOC'],segments:{city:['北京']}});assert.equal(p.rounds.length,1);assert.equal(p.rounds[0].filters.keyword,'FOC');
});
