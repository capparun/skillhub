import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {inspect} from '../lib/dom.js';
function snapshot(records,{icon='M9.883 4.31 synthetic work icon'}={}){
 const shown={getClientRects:()=>[{}]};
 const row=([text,period])=>({...shown,children:[{...shown,tagName:'SPAN',textContent:text,getAttribute:()=>null},{...shown,tagName:'SPAN',textContent:period,getAttribute:()=>null}]});
 const group={querySelector:()=>({getAttribute:()=>icon}),querySelectorAll:()=>records.map(row)};
 const card={...shown,id:'card',innerText:'unstructured summary is not a field source',querySelector:s=>s==='.new-resume-personal'?{nextElementSibling:{firstElementChild:group}}:null,querySelectorAll:()=>[]};
 const document={body:{innerText:'猎聘搜索结果'},readyState:'complete',querySelector:()=>null,querySelectorAll:s=>s==='.detail-resume-card-wrap .tlog-common-resume-card'||s==='#card'?[card]:[]};
 return vm.runInNewContext(`(${inspect.toString()})({mode:'results',limit:1})`,{document,location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},getComputedStyle:()=>({visibility:'visible'}),CSS:{escape:s=>s},performance:{getEntriesByType:()=>[]}}).rows[0];
}
test('explicit current employment is separated from historical work records',()=>{
 const row=snapshot([['示例科技 · 嵌入式工程师','2021.06-至今(5年)'],['历史公司 · 软件工程师','2019.01-2021.05']]);
 assert.equal(row.currentCompany,'示例科技');assert.equal(row.currentTitle,'嵌入式工程师');assert.equal(row.employment.length,2);assert.equal(row.employment[0].period,'2021.06-至今(5年)');
});
test('past-only, ambiguous current, malformed fields and an education icon never produce current employer',()=>{
 for(const row of [snapshot([['历史公司 · 工程师','2019.01-2021.05']]),snapshot([['甲 · 工程师','2021.06-至今'],['乙 · 顾问','2022.01-至今']]),snapshot([['公司 · 事业部 · 岗位','2021.06-至今']]),snapshot([['大学 · 硕士','2021.06-至今']],{icon:'education icon'})]){
  assert.equal(row.currentCompany,null);assert.equal(row.currentTitle,null);
 }
 assert.equal(snapshot([['公司 · 岗位','未知时间']]).employment.length,0);
});
