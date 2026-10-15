import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {inspectRecords} from '../lib/records-dom.js';
test('observed save modal distinguishes text from checkbox and spaced button labels',()=>{
 const node=(id,text='')=>({id,textContent:text,getBoundingClientRect:()=>({width:100,height:20}),querySelectorAll:()=>[]});
 const input=Object.assign(node('name'),{type:'text'}),label=node('subscription'),check=Object.assign(node('check'),{type:'checkbox',checked:true,closest:()=>label});
 const confirm=node('confirm','确 定'),cancel=node('cancel','取 消'),dialog=node('dialog','保存新的搜索条件 订阅简历');
 dialog.querySelectorAll=s=>s==='input'?[input,check]:s==='input[type="checkbox"]'?[check]:s==='button'?[confirm,cancel]:[];
 const document={title:'fixture',body:{innerText:'保存新的搜索条件'},querySelectorAll:s=>s==='button'?[confirm,cancel]:s==='[role="dialog"], .ant-modal'?[dialog]:[]};
 const result=vm.runInNewContext(`(${inspectRecords.toString()})()`,{document,location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},getComputedStyle:()=>({visibility:'visible',display:'block'}),CSS:{escape:s=>s}});
 assert.equal(result.dialog.input,'#name');assert.equal(result.dialog.confirm,'#confirm');assert.equal(result.dialog.cancel,'#cancel');assert.equal(result.dialog.subscription.checked,true);assert.equal(result.dialog.subscription.selector,'#subscription');
});
