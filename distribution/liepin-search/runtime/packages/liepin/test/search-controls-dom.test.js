import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspect} from '../lib/dom.js';
function controls(bothReachable=false){
 const node=(id,text,x,children=[])=>({id,textContent:text,children,getClientRects:()=>[{}],getBoundingClientRect:()=>({left:x,top:0,width:10,height:10}),contains:child=>children.includes(child),outerHTML:'<button />'});
 const icon={},reset=node('reset','清空筛选条件',40,[icon]),main=node('main','搜 索',0),sticky=node('sticky','搜 索',20);
 const nodes=[main,sticky,reset];
 const document={body:{innerText:'猎聘搜索当前条件界面'},readyState:'complete',querySelector:()=>main,
 querySelectorAll:s=>s==='span,a,button,div'?nodes:s==='.search-btn, button'?[main,sticky]:s.startsWith('#')?nodes.filter(n=>`#${n.id}`===s):[],
 elementFromPoint:x=>x===5?main:x===25?(bothReachable?sticky:{}):icon};
 return vm.runInNewContext(`(${inspect.toString()})({mode:'controls'})`,{document,location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},getComputedStyle:()=>({visibility:'visible'}),CSS:{escape:s=>s}});
}
test('icon-bearing reset is found and covered duplicate search button is excluded',()=>{
 const state=controls();assert.equal(state.reset,'#reset');assert.equal(state.submit,'#main');assert.equal(state.submitCount,1);
});
test('two reachable search buttons remain ambiguous',()=>{
 const state=controls(true);assert.equal(state.submit,null);assert.equal(state.submitCount,2);
});
test('selection summary returns visible filter pills without reading candidate cards',()=>{
 const queried=[];
 const pill=(text,shown)=>({textContent:text,getClientRects:()=>shown?[{}]:[],closest:()=>({getAttribute:()=> '学校名称'})});
 const document={body:{innerText:'猎聘搜索当前条件界面'},readyState:'complete',querySelector:()=>({}),
  querySelectorAll:selector=>{queried.push(selector);return selector==='.text-choose'?[pill(' 清华大学 ',true),pill('隐藏项',false)]:[];}};
 const state=vm.runInNewContext(`(${inspect.toString()})({mode:'selection-summary'})`,{document,
  location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},
  getComputedStyle:()=>({visibility:'visible'})});
 assert.equal(state.selected.length,1);assert.equal(state.selected[0].text,'清华大学');
 assert.equal(state.selected[0].title,'学校名称');assert.ok(state.observedAt);
 assert.equal(queried.some(selector=>selector.includes('resume-card')),false);
});
test('control snapshots collect filter text inputs without candidate checkbox values',()=>{
 const field={id:'keyword',type:'text',value:'嵌入式开发',placeholder:'关键词',getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,width:10,height:10})};
 const checkbox={...field,id:'candidate',type:'checkbox',value:'private-candidate-id'};
 const queried=[];
 const document={body:{innerText:'猎聘搜索当前条件界面'},readyState:'complete',querySelector:()=>({}),elementFromPoint:()=>null,
  querySelectorAll:selector=>{queried.push(selector);if(selector==='.search-item input, .search-top-bar input, .search-auto-complete-box input')return [field,checkbox];if(selector==='input')throw Error('Must not scan global inputs');return [];}};
 const state=vm.runInNewContext(`(${inspect.toString()})({mode:'controls'})`,{document,
  location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},getComputedStyle:()=>({visibility:'visible'}),CSS:{escape:s=>s}});
 assert.equal(state.nonemptyInputs.length,1);assert.equal(state.nonemptyInputs[0].value,'嵌入式开发');
 assert.equal(JSON.stringify(state).includes('private-candidate-id'),false);
});

function languageReadback(pills, request={key:'resumeLanguage',kind:'select',label:'简历语言',value:'中文简历'}) {
 const nodes=pills.map(([title,text,shown=true])=>({textContent:text,getClientRects:()=>shown?[{}]:[],closest:()=>({getAttribute:()=>title})}));
 const document={body:{innerText:'猎聘搜索当前条件界面'},readyState:'complete',querySelector:()=>({}),
  querySelectorAll:s=>s==='.text-choose'?nodes:[]};
 return vm.runInNewContext(`(${inspect.toString()})(${JSON.stringify(request)})`,{document,
  location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},getComputedStyle:()=>({visibility:'visible'})});
}
test('language readback accepts exact labelled selected-condition pill when control label disappears',()=>{
 const state=languageReadback([['简历语言','中文简历']]);
 assert.equal(state.rootPath,null);assert.equal(state.target,null);
 assert.equal(state.committed,true);assert.equal(state.summaryCommitted,true);
});
test('language readback rejects hidden, differently labelled, different-value and ambiguous pills',()=>{
 for(const pills of [[['简历语言','中文简历',false]],[['其他字段','中文简历']],[['简历语言','英文简历']],[['简历语言','中文简历'],['简历语言','英文简历']]]){
  assert.equal(languageReadback(pills).committed,false);
 }
 assert.equal(languageReadback([['简历语言','中文简历']],{key:'company',kind:'autocomplete',label:'简历语言',value:'中文简历'}).committed,false);
});
test('observed autocomplete summaries survive focus changes with exact field mapping',()=>{
 for(const [key,label,title,value] of [
  ['title','职位名称','职位名称','嵌入式开发'],
  ['company','公司名称','公司名称','华为'],
  ['school','毕业院校','学校名称','清华大学'],
  ['major','专业名称','专业名称','计算机科学与技术'],
 ]){
  const request={key,kind:'autocomplete',label,value};
  assert.equal(languageReadback([[title,value]],request).committed,true);
  assert.equal(languageReadback([[title,value+'其他']],request).committed,false);
  assert.equal(languageReadback([[title,value],[title,value]],request).committed,false);
 }
});
test('screen-reader announcement alone cannot prove committed autocomplete selection',()=>{
 const announcement={children:[],textContent:'华为',getClientRects:()=>[{}],closest:s=>s.includes('[aria-live]')?{}:null};
 const root={id:'company-row',textContent:'公司名称：华为',outerHTML:'<div id="company-row" />',getClientRects:()=>[{}],
  querySelector:s=>s===':scope > .search-item-title'?{textContent:'公司名称：'}:null,
  querySelectorAll:s=>s==='span, div'?[announcement]:[]};
 const document={body:{innerText:'猎聘搜索当前条件界面'},readyState:'complete',querySelector:()=>({}),querySelectorAll:s=>s==='.search-item'||s==='#company-row'?[root]:[]};
 const state=vm.runInNewContext(`(${inspect.toString()})({key:'company',kind:'autocomplete',label:'公司名称',value:'华为'})`,{document,
  location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},getComputedStyle:()=>({visibility:'visible'}),CSS:{escape:s=>s}});
 assert.equal(state.committed,false);
});
