import {filters,plan} from './filters.js';
import {run} from './engine.js';
import {inspect} from './dom.js';
import {readSavedSearches,saveSearchPlan,applySavedSearch,deleteSavedSearch} from './records.js';
import {openCurrentSearchDriver} from './search-driver.js';
import {executeScopedOperation} from './site-scope.js';
import {waitForFreshResults} from './result-freshness.js';
import {identifyListRow} from './list-identity.js';
import {updateTask,mergeListResults} from './task-store.js';
export const savedTaskArgs=[
 {name:'file',type:'string',required:true,help:'本地任务文件'},
 {name:'page',type:'string',required:true,help:'connect 返回的搜索页 targetId'},
 {name:'operationId',type:'string',required:true,help:'持久操作标识'},
];
export async function savedSearchTask(action,args,{openDriver=openCurrentSearchDriver,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
 if(!['list','save','apply','delete'].includes(action) || !/^[a-fA-F0-9]{16,128}$/.test(args.page ?? ''))throw new Error('需要有效操作和已绑定搜索页');
 const name=String(args.name ?? '').trim(),limit=Number(args.limit ?? 10);
 if(action!=='list' && (!name || name.length>10))throw new Error('方案名须为1–10个字符');
 if(action==='apply' && (!Number.isInteger(limit) || limit<1 || limit>30))throw new Error('limit须为1–30');
 const values=Object.fromEntries(Object.keys(filters).filter(k=>args[k]!==undefined).map(k=>[k,args[k]]));
 const current=args.current===true;
 if(current && (action!=='save' || Object.keys(values).length))throw new Error('保存当前条件不能混用筛选参数或其他动作');
 if(action==='save' && !current)plan(values);
 const kind={list:'inspect',save:'save-search',apply:'apply-search',delete:'delete-search'}[action];
 const payload={action,page:args.page,...(action==='list'?{}:{name}),...(action==='save'?(current?{current:true}:{filters:values}):{}),...(action==='apply'?{limit}:{})};
 const evidence=await executeScopedOperation(args.file,{operationId:args.operationId,kind,payload},async()=>{
  const driver=await openDriver(args.page);
  try {
   let result;
   if(action==='list')result={schemes:(await readSavedSearches(driver)).schemes.map(({name,subscribed})=>({name,subscribed}))};
   if(action==='save'){
    const prepared=current?null:await run(driver,values,{submit:false,pause});
    const state=current?await driver.evaluate(inspect,{mode:'controls'}):null;
    const saved=await saveSearchPlan(driver,name,{pause});
    result={name,saved:true,subscribed:saved.subscribed??null,
     verification:saved.verification??'saved_scheme_list',listVerified:saved.listVerified??true,
     ...(current?{current:true,selectedConditions:state.selectedEvidence??[],inputConditions:state.nonemptyInputs??[]}:{applied:prepared.applied})};
   }
   if(action==='delete')result=await deleteSavedSearch(driver,name,{pause});
   if(action==='apply'){
    await driver.prepareResultObservation?.();
    const baseline=await driver.evaluate(inspect,{mode:'results',limit});
    await applySavedSearch(driver,name,{pause});
    const fresh=await waitForFreshResults(()=>driver.evaluate(inspect,{mode:'results',limit}),baseline,{pause});
    result={name,total:fresh.total,rows:fresh.rows.slice(0,limit).map(row=>({...identifyListRow(row),source:'liepin'}))};
   }
   return {status:'completed',evidence:result};
  }finally{await driver.close();}
 });
 if(action==='apply' && evidence.rows)updateTask(args.file,t=>mergeListResults(t,evidence.rows,{roundId:`saved-search-${args.operationId}`}));
 return evidence;
}
