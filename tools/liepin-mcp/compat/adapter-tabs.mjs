/** Runtime-side compatibility API. Never expose runtime internals to adapters.
 * bindTab must bind the SAME site:<name> session, not a regular mcp session.
 * Ownership comes only from an actual act result, never caller-supplied IDs.
 */
export function createAdapterTabLifecycle({tab,bindTab,activateTab,openTab}){
 const owned=new Set(),handles=new Map();
 const valid=id=>/^\d+$/.test(id)&&Number.isSafeInteger(Number(id));
 const parentId=()=>String(tab.id);
 const wrapped=new Proxy(tab,{get(target,key){
  if(key!=='act'){
   const value=Reflect.get(target,key,target);
   return typeof value==='function'?value.bind(target):value;
  }
  return async args=>{
   const result=await target.act(args);
   for(const child of result.openedTabs??[]){
    const id=String(child.tab??child.tabId);
    if(!valid(id)||id===parentId())throw Error('Invalid child tab identity');
    owned.add(id);
   }
   return result;
  };
 }});
 const tabs={
  async openSearch(){
   if(typeof openTab!=='function')throw Error('Adapter workspace creation unavailable');
   const id=String(await openTab('https://h.liepin.com/search/getConditionItem'));
   if(!valid(id)||id===parentId()||owned.has(id))throw Error('Invalid created tab identity');
   owned.add(id);
   return tabs.child(id);
  },
  async openFavorites(){
   if(typeof openTab!=='function')throw Error('Adapter workspace creation unavailable');
   // Fixed destination only. Ownership is granted by the returned creation result,
   // never by an existing ID supplied by a caller.
   const id=String(await openTab('https://h.liepin.com/resumemanage/showmytalentlist'));
   if(!valid(id)||id===parentId()||owned.has(id))throw Error('Invalid created tab identity');
   owned.add(id);
   return tabs.child(id);
  },
  async child(id){
   id=String(id);if(!owned.has(id))throw Error('Tab was not opened by this adapter call');
   if(!handles.has(id)){
    const handle=await bindTab(id);
    if(String(handle.id)!==id)throw Error('Bound child identity mismatch');
    handles.set(id,handle);
   }
   return handles.get(id);
  },
  async closeChild(id){
   id=String(id);const handle=await tabs.child(id);
   await handle.close();owned.delete(id);handles.delete(id);
  },
  async returnToParent(){
   const id=parentId();if(!valid(id))throw Error('Parent tab is not bound');
   await activateTab(id);
  },
  opened(){return [...owned];},
 };
 return {tab:wrapped,tabs};
}

export function createAdapterUserTabs({list,listBound=async()=>[],claim,getMetadata}){
 const validUrl=value=>{
  const url=new URL(value);
  if(url.origin!=='https://h.liepin.com'||url.username||url.password||!['/search/getConditionItem','/resume/showresumedetail/','/resumemanage/showmytalentlist'].includes(url.pathname))throw Error('Unsupported Liepin tab');
  if(url.pathname==='/resume/showresumedetail/'&&(url.searchParams.getAll('res_id_encode').length!==1||!url.searchParams.get('res_id_encode')))throw Error('Missing detail identity');
 };
 return {
  async list(){
   // user-tabs excludes active leases. Only add leases from this site's session;
   // never enumerate or reclaim another session's controlled pages.
   const rows=[...await list(),...(await listBound()).filter(row=>row.state==='active')];
   const unique=new Map();
   for(const row of rows){
    try{validUrl(row.url);if(Number.isSafeInteger(row.tabId)&&row.tabId>0)unique.set(row.tabId,row);}catch{}
   }
   return [...unique.values()];
  },
  async lookup(id){
   if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))throw Error('Invalid tab ID');
   if(typeof getMetadata!=='function')throw Error('Global tab existence check unavailable');
   const result=await getMetadata(id);
   if(result?.tabId!==id||typeof result.exists!=='boolean')throw Error('Tab existence result is invalid');
   return result;
  },
  async bind(id,expectedUrl){
   if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))throw Error('Invalid tab ID');validUrl(expectedUrl);
   const rows=await this.list();
   const observed=rows.find(row=>String(row.tabId)===id);
   if(!observed)throw Object.assign(Error('Tab is not in this adapter binding inventory; it may be controlled by another session'),{code:'adapter_tab_unavailable'});
   if(observed.url!==expectedUrl)throw Object.assign(Error('Observed tab URL changed'),{code:'adapter_tab_url_changed'});
   const bound=await claim({tabId:Number(id),expectedUrl});
   if(String(bound.page)!==id||bound.tabId!==Number(id)||bound.url!==expectedUrl)throw Error('Claim result identity changed');
   return {id,ownership:'user'}; // Deliberately no close handle or child ownership.
  },
 };
}
