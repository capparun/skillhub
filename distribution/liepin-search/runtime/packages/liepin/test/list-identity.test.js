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
