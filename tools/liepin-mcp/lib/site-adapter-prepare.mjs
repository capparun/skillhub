import {logger} from './workflow.mjs';
import {coreFilters} from './site-adapter-filters.mjs';
import {prepareFilters} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/prepare-task.js';
import {createMcpSearchDriver,assertLiepinUrl} from './transport.mjs';
import {executeMcpOperation} from './execution.mjs';
import {readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {plan} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/filters.js';
import {inspect} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/dom.js';

export async function prepareAdapterFilters({args,tab,signal},{apply,createDriver=createMcpSearchDriver,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(signal?.aborted)throw Error('操作已取消');
 if(String(tab.id)!==args.tab_id)throw Error('官方 Adapter 绑定的页面与指定标签不一致');
 if(args.options_only===true){
  if(args.verify_only===true)throw Error('只读回读与打开选项模式不能同时使用');
  const filters=coreFilters(args.filters),steps=plan(filters).steps;
  if(steps.some(s=>!['choice','select'].includes(s.kind)))throw Error('选项发现仅支持选择类字段');
  return executeMcpOperation(args.file,{operationId:args.operation_id,kind:'inspect',payload:{view:'filter-options',page:args.tab_id,filters}},async({check})=>{
   const expectedUrl=await tab.url();assertLiepinUrl(expectedUrl,'/search/getConditionItem');
   const onAction=logger(args.file,{operationId:args.operation_id,tabId:args.tab_id}),driver=createDriver(tab,{expectedUrl,signal,onAction}),fields=[];
   for(const step of steps){
    check();let state=await driver.evaluate(inspect,step);
    if(state.loading)throw Error('页面正在加载，未打开筛选选项');
    if(step.kind==='select'){
     const target=state.activationTarget??state.target??step.selector;if(!target)throw Error('未发现唯一下拉入口');
     await driver.click(target);
     for(let i=0;i<6;i++){await pause(200);check();state=await driver.evaluate(inspect,step);if(state.dropdownOptions?.length)break;}
     if(!state.dropdownOptions?.length)throw Error('下拉选项尚未确认，不选择任何值');
     fields.push({field:step.key,options:state.dropdownOptions,currentValue:state.value??null});
     await driver.pressKey('Escape');
    }else fields.push({field:step.key,options:state.choiceOptions??[],currentValue:state.value??null});
   }
   return {status:'completed',evidence:{fields,selectionChanged:false,searchSubmitted:false,description:'仅打开并收起下拉查看选项，没有选择值或点击搜索'}};
  },{signal});
 }
 if(args.verify_only===true){
  readTask(args.file); // A paused task may be inspected, never implicitly resumed.
  const steps=plan(coreFilters(args.filters)).steps;
  const expectedUrl=await tab.url();assertLiepinUrl(expectedUrl,'/search/getConditionItem');
  const observe=async request=>{
   if(signal?.aborted)throw Error('操作已取消');
   const state=await tab.evaluate(inspect,{arg:{...request,expectedUrl}});
   if(signal?.aborted)throw Error('操作已取消');
   if(state.blocked||state.blank||state.login||state.risk||state.loading)throw Error('页面尚不适合核对筛选，未执行任何写操作');
   assertLiepinUrl(state.url,'/search/getConditionItem');
   return state;
  };
  const fields=[];
  for(const step of steps){
   const state=await observe(step);
   fields.push({field:step.key,requested:step.value,value:state.value??null,committed:state.committed===true,
    selected:state.selected===true,checked:state.checked??null,selectionTexts:state.selectionTexts??[],
    choiceOptions:state.choiceOptions??[],dropdownOptions:state.dropdownOptions??[],
    rootPath:state.rootPath??null,rootHtml:state.rootHtml??null});
  }
  const summary=await observe({mode:'selection-summary'});
  return {readOnly:true,description:'只读取筛选控件和已选摘要，未点击、未清空、未搜索',fields,
   selectedSummary:summary.selected??[],observedAt:new Date().toISOString(),taskStatusUnchanged:true};
 }
 return prepareFilters({...coreFilters(args.filters),file:args.file,operationId:args.operation_id,page:args.tab_id},{
  ...(apply?{apply}:{}),
  validatePage:page=>typeof page==='string'&&/^\d+$/.test(page)&&Number.isSafeInteger(Number(page)),
  execute:(file,request,work)=>executeMcpOperation(file,request,work,{signal}),
  openDriver:async(id,{onAction})=>{
   if(signal?.aborted)throw Error('操作已取消');
   const expectedUrl=await tab.url();assertLiepinUrl(expectedUrl,'/search/getConditionItem');
   const driver=createMcpSearchDriver(tab,{expectedUrl,signal,onAction});
   return {...driver,close:async()=>{}}; // Preserve the official session's bound tab.
  },
 });
}
