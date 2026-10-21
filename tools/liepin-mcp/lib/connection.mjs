import {readTask,updateTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
const views={'/search/getConditionItem':'search','/resume/showresumedetail/':'detail','/resumemanage/showmytalentlist':'favorites'};
export function pageView(value){
 const url=new URL(value);
 if(url.origin!=='https://h.liepin.com'||url.username||url.password||!views[url.pathname])throw Error('只允许绑定已支持的猎聘页面');
 if(views[url.pathname]==='detail'){
  const ids=url.searchParams.getAll('res_id_encode');if(ids.length!==1||!ids[0])throw Error('详情地址缺少唯一身份');
 }
 return views[url.pathname];
}
export async function existingTabs(client){
 await client.verify();const rows=await client.existingTabs();
 if(!Array.isArray(rows))throw Error('浏览器标签清单无效');
 return rows.flatMap(row=>{
  try{
   if(!Number.isSafeInteger(row.tabId)||row.tabId<=0)return [];
   return [{tab_id:String(row.tabId),url:row.url,view:pageView(row.url),active:row.active===true}];
  }catch{return [];}
 });
}
export async function bindExisting(client,{file,tab_id,expected_url}){
 readTask(file);const view=pageView(expected_url);
 if(!/^[1-9]\d*$/.test(tab_id)||!Number.isSafeInteger(Number(tab_id)))throw Error('需要清单中已观察到的数字标签ID');
 await client.verify();const tab=await client.claimExisting(tab_id,expected_url);
 // Official claim checks expectedUrl without navigating or observing page content.
 updateTask(file,t=>{
  t.mcpBindings??=[];
  t.mcpBindings=t.mcpBindings.filter(b=>b.tabId!==tab_id);
  t.mcpBindings.push({tabId:tab.id,url:expected_url,view,ownership:'user',boundAt:new Date().toISOString()});
  t.events.push({type:'browser_binding',phase:'verified',description:'绑定已有猎聘标签，未新建页面、未读取正文',tabId:tab.id,view,at:new Date().toISOString()});return t;
 });
 return {tabId:tab.id,view,ownership:'user',created:false};
}
