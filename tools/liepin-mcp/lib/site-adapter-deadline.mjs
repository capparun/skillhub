// Leave margin before the official executor's 120s response timeout.
// An in-flight browser command cannot be recalled; prevent subsequent commands.
export function withAdapterDeadline(run,{timeoutMs=100_000,now=()=>performance.now()}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw Error('Invalid adapter deadline');
 return async context=>{
  const controller=new AbortController();
  const deadline=now()+timeoutMs;
  const cancel=()=>controller.abort(context.signal?.reason);
  const check=()=>{
   if(now()>=deadline&&!controller.signal.aborted)controller.abort(Error('Adapter deadline exceeded'));
   if(controller.signal.aborted)throw Error('Adapter 已取消或达到执行时限；已派发动作须核对，不自动重放');
  };
  if(context.signal?.aborted)cancel();
  context.signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(Error('Adapter deadline exceeded')),timeoutMs);
  timer.unref?.();
  const tab=new Proxy(context.tab,{get(target,key){
   const value=Reflect.get(target,key,target);
   if(typeof value!=='function')return value;
   return async(...args)=>{check();const result=await value.apply(target,args);check();return result;};
  }});
  try{check();return await run({...context,tab,signal:controller.signal});}
  finally{clearTimeout(timer);context.signal?.removeEventListener('abort',cancel);}
 };
}
