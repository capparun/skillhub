import {randomUUID} from 'node:crypto';
const stores=new WeakMap();
/** Runtime-only capabilities. A restarted site session cannot recover close authority from disk. */
export function detailReviewStore(session){
 if(stores.has(session))return stores.get(session);
 const reviews=new Map();
 const get=(token,file,parent)=>{
  const entry=reviews.get(token);
  if(!entry||entry.file!==file||entry.parent!==String(parent))throw Error('详情审阅会话不存在或归属不符；保留页面，不凭旧标签ID操作');
  return entry;
 };
 const store={
  assertAvailable(parent){if([...reviews.values()].some(e=>e.parent===String(parent)))throw Error('先完成当前详情审阅，不重复打开');},
  async retain({file,parent,child,returnToParent}){
   store.assertAvailable(parent);
   const snapshot=await child.evaluate(()=>({url:location.href,timeOrigin:performance.timeOrigin}));
   const url=new URL(snapshot.url);
   if(url.origin!=='https://h.liepin.com'||url.pathname!=='/resume/showresumedetail/'||url.username||url.password||url.searchParams.getAll('res_id_encode').length!==1||!/^[A-Za-z0-9_-]{1,512}$/.test(url.searchParams.get('res_id_encode')??'')||!Number.isFinite(snapshot.timeOrigin))throw Error('详情文档身份不可确认');
   const token=randomUUID();reviews.set(token,{file,parent:String(parent),child,returnToParent,snapshot,busy:false});
   return {token,tabId:String(child.id),url:url.href};
  },
  async use(token,{file,parent},work){
   const entry=get(token,file,parent);if(entry.busy)throw Error('详情审阅操作正在执行，不重复派发');entry.busy=true;
   try{
    const snapshot=await entry.child.evaluate(()=>({url:location.href,timeOrigin:performance.timeOrigin}));
    if(snapshot.url!==entry.snapshot.url||snapshot.timeOrigin!==entry.snapshot.timeOrigin)throw Error('详情已导航或重新加载；不沿用旧审阅权限');
    return await work(entry.child);
   }finally{entry.busy=false;}
  },
  async finish(token,identity){
   const entry=get(token,identity.file,identity.parent);
   await store.use(token,identity,child=>child.close());
   reviews.delete(token);
   try{await entry.returnToParent();return {closed:true,returned:true};}
   catch(error){return {closed:true,returned:false,returnError:error.message};}
  },
 };
 stores.set(session,store);return store;
}
