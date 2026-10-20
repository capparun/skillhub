import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {reportControls,reportScriptHash} from '../lib/report-controls.js';

test('local search, detail filtering and paging reset coherently without network APIs',()=>{
  const rows=Array.from({length:25},(_,index)=>({textContent:`合成 ${index}`,dataset:{detailState:index<3?'partial':'unread'},hidden:false}));
  const elements=Object.fromEntries(['candidate-search','candidate-state','candidate-previous','candidate-next','candidate-count'].map(id=>[id,{
    value:id==='candidate-state'?'all':'',listeners:{},addEventListener(event,listener){this.listeners[event]=listener;},
  }]));
  vm.runInNewContext(reportControls,{document:{addEventListener(){},querySelectorAll:()=>rows,getElementById:id=>elements[id]}});
  const visible=()=>rows.filter(row=>!row.hidden).length;
  assert.equal(visible(),20);
  elements['candidate-next'].listeners.click();
  assert.equal(visible(),5);
  elements['candidate-state'].value='partial';elements['candidate-state'].listeners.change();
  assert.equal(visible(),3);
  assert.equal(elements['candidate-previous'].disabled,true);
  elements['candidate-search'].value='没有匹配';elements['candidate-search'].listeners.input();
  assert.equal(visible(),0);
  assert.match(elements['candidate-count'].textContent,/符合条件 0 \/ 25/);
  assert.equal(elements['candidate-next'].disabled,true);
  assert.equal(reportScriptHash,createHash('sha256').update(reportControls).digest('base64'));
});

test('candidate comparison link opens the matching collapsed resume',()=>{
 const profile={open:false};let click;
 const link={getAttribute:()=> '#candidate-3'};
 vm.runInNewContext(reportControls,{document:{addEventListener(type,listener){click=listener;},querySelectorAll:()=>[],getElementById:id=>id==='candidate-3'?{querySelector:()=>profile}:null}});
 click({target:{closest:()=>link}});
 assert.equal(profile.open,true);
 click({target:{closest:()=>null}});
});
