import test from 'node:test';
import assert from 'node:assert/strict';
import {identifyListRow} from '../lib/list-identity.js';
const link=id=>`https://h.liepin.com/resume/showresumedetail/?res_id_encode=${id}`;
test('visible detail URLs supply stable identity without dropping context or card evidence',()=>{
 const row={name:'匿名',summary:'合成文本',detailTarget:'#name',detailLinks:[link('abc')+'&session=one',link('abc')+'&session=two']};
 const result=identifyListRow(row);
 assert.equal(result.resumeId,'abc');assert.equal(result.identityEvidence,'visible-detail-link');
 assert.equal(result.summary,row.summary);assert.equal(result.detailTarget,'#name');assert.equal(row.resumeId,undefined);
});
test('missing, conflicting, foreign or malformed links never invent a resume ID',()=>{
 for(const detailLinks of [[],[link('a'),link('b')],['https://example.com/resume/showresumedetail/?res_id_encode=a'],['javascript:alert(1)'],[link('a')+'&res_id_encode=b'],[link('a%2Fb')]]) {
  assert.equal(identifyListRow({name:'同名',detailLinks}).resumeId,undefined);
 }
});
test('the row class names the resume when the card carries no detail link',()=>{
 const row={name:'李**阅',detailLinks:[],rowClassResumeId:'65fd2264deV7ddeb96600d3'};
 const result=identifyListRow(row);
 assert.equal(result.resumeId,'65fd2264deV7ddeb96600d3');
 assert.equal(result.identityEvidence,'row-class');
 assert.equal(result.observedDetailUrl,null);
 assert.equal(row.resumeId,undefined);
});
test('row class and detail link must agree, otherwise identity stays unresolved',()=>{
 const same=identifyListRow({detailLinks:[link('abc')],rowClassResumeId:'abc'});
 assert.equal(same.resumeId,'abc');assert.equal(same.identityEvidence,'visible-detail-link');
 const conflicted=identifyListRow({detailLinks:[link('abc')],rowClassResumeId:'other'});
 assert.equal(conflicted.resumeId,undefined);assert.equal(conflicted.identityEvidence,'conflicting-row-class');
 const existing=identifyListRow({detailLinks:[],rowClassResumeId:'abc',resumeId:'other'});
 assert.equal(existing.identityEvidence,'conflicting-existing-id');
});
test('a malformed row class is not identity',()=>{
 for(const rowClassResumeId of ['',' ','有中文','a b','a/b',null,42]) {
  assert.equal(identifyListRow({detailLinks:[],rowClassResumeId}).identityEvidence,'no-detail-link');
 }
});
