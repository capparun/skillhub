import {LIEPIN_MANAGED,LIEPIN_MANAGED_SESSION,matchesConnection} from './connection.js';
import {createLiepinPage} from './page-connection.js';
import {checkReadRuntime} from './current-detail.js';
import {cleanupSavedDetails} from './tab-cleanup.js';

export function officialCleanupDriver(manager,parentPage) {
 let parentUrl;
 return {
  checkParent:async page=>{
   if(page!==parentPage)throw new Error('清理父标签不匹配');
   await manager.selectTab(parentPage);
   const tabs=await manager.tabs(),tab=tabs[0];
   if(tabs.length!==1 || tab.page!==parentPage || !matchesConnection(tab))throw new Error('原搜索标签无法核对');
   const url=new URL(tab.url);
   if(url.origin!=='https://h.liepin.com' || url.pathname!=='/search/getConditionItem'
    || (parentUrl && parentUrl!==tab.url))throw new Error('原搜索标签已变化，停止清理');
   parentUrl=tab.url;
   return {page:tab.page,url:tab.url,title:tab.title};
  },
  inspect:async target=>{
   try{await manager.selectTab(target);}catch(error){
    // Only the bridge's explicit missing-target response proves absence.
    // A timeout, disconnected bridge or moved tab must preserve the target.
    if(error.message==='Page no longer exists'
     || error.message===`Page not found: ${target} — stale page identity`)return null;
    throw error;
   }
   const tabs=await manager.tabs();
   if(tabs.length!==1 || tabs[0].page!==target || !matchesConnection(tabs[0]))
    throw new Error('清理目标无法唯一核对');
   return tabs[0];
  },
  close:target=>manager.closeTab(target),
 };
}

export async function cleanupManagedDetails(args) {
 if(!LIEPIN_MANAGED)throw new Error('自动清理仅适用于 official-managed 创建的详情；借用的用户页面保留');
 checkReadRuntime();
 const manager=await createLiepinPage({session:LIEPIN_MANAGED_SESSION});
 return cleanupSavedDetails(args,{driver:officialCleanupDriver(manager,args.page)});
}
