import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspect} from '../lib/dom.js';
import {plan} from '../lib/filters.js';

// Reproduces the observed label/em boundary; no candidate or account data.
function read(value,{duplicate=false,nestedSpan=false}={}) {
 const make=(id,text,tag='LABEL')=>({id,textContent:text,tagName:tag,children:[],className:'tag-item selected',outerHTML:'<label>3-5年</label>',
  querySelector:()=>null,querySelectorAll:()=>[],getClientRects:()=>[{}],getBoundingClientRect:()=>({left:0,top:0,width:50,height:20}),getAttribute:()=>null,
  contains(child){return this.children.includes(child);},closest(selector){return selector.startsWith('label')?this:null;}});
 const option=make('range','3-5年');const child=make('number','3-5',nestedSpan?'SPAN':'EM');option.children=[child];
 const matches=[option,...(nestedSpan?[child]:[]),...(duplicate?[make('other','3-5年')]:[])];
 const root=make('root','工作年限：不限应届生1-3年3-5年5-10年10年以上自定义','DIV');
 root.querySelector=s=>s===':scope > .search-item-title'?{textContent:'工作年限：'}:null;
 root.querySelectorAll=s=>s==='label, span, button, div'?matches:[];
 const document={body:{innerText:'工作年限：不限应届生1-3年3-5年5-10年10年以上自定义'},
  querySelector:()=>root,querySelectorAll:s=>s==='.search-item'?[root]:s==='#root'?[root]:s==='#range'?[option]:s==='#number'?[child]:s==='#other'?[matches.at(-1)]:[],elementFromPoint:()=>option};
 const context={document,location:{origin:'https://h.liepin.com',pathname:'/search/getConditionItem',href:'https://h.liepin.com/search/getConditionItem'},CSS:{escape:s=>s},getComputedStyle:()=>({visibility:'visible'}),request:plan({experience:value}).steps[0]};
 return vm.runInNewContext(`(${inspect.toString()})(request)`,context);
}
test('live em/year markup resolves to the clickable label with or without the year unit',()=>{
 for(const value of ['3-5','3-5年','3-5 年']){const state=read(value);assert.equal(state.choice,'#range');assert.equal(state.selected,true);}
});
test('duplicate range labels stay ambiguous; eligible nested matches remain selectable',()=>{
 assert.equal(read('3-5',{duplicate:true}).choice,null);
 assert.equal(read('3-5',{nestedSpan:true}).choice,'#number');
});
