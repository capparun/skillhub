import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {inspect} from '../lib/dom.js';
test('Ant checkbox is clicked through its visible label but verified from the input',()=>{
 const make=(id,text,tag)=>({id,textContent:text,tagName:tag,children:[],className:'',classList:[],outerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,width:100,height:20}),getAttribute:()=>null,contains:()=>false,closest:()=>null});
 const input=make('checkbox','', 'INPUT'),label=make('label','海外工作经验','LABEL'),root=make('root','其他：海外工作经验管理经验','DIV');
 input.checked=true;input.closest=s=>s==='label'?label:s==='.search-item'?root:null;
 const nodes=[input,label,root];const doc={body:{innerText:'猎聘页面，海外工作经验和管理经验两个复选框'},querySelector:()=>root,querySelectorAll:s=>s==='input[name="workAbroad"]'?[input]:s.startsWith('#')?nodes.filter(n=>`#${n.id}`===s):[],elementFromPoint:()=>label};
 const state=vm.runInNewContext(`(${inspect.toString()})({kind:'check',label:'海外工作经验',selector:'input[name="workAbroad"]',value:'true'})`,{document:doc,location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},CSS:{escape:s=>s},getComputedStyle:()=>({visibility:'visible'})});
 assert.equal(state.target,'#label');assert.equal(state.checked,true);
});
