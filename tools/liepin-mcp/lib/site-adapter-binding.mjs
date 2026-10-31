import {existingTabs,bindExisting} from './connection.mjs';
function client({userTabs,signal}){
 const check=()=>{if(signal?.aborted)throw Error('标签绑定已取消');};
 if(!userTabs?.list||!userTabs?.bind)throw Error('缺少已打开标签兼容接口');
 return {
  verify:async()=>check(),
  existingTabs:async()=>{check();const rows=await userTabs.list();check();return rows;},
  claimExisting:async(id,url)=>{check();const bound=await userTabs.bind(id,url);check();if(String(bound.id)!==id)throw Error('绑定返回的标签身份不一致');return bound;},
 };
}
export function adapterTabs(context){return existingTabs(client(context));}
export function adapterBind(context){return bindExisting(client(context),context.args);}
