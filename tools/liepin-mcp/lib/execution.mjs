import {readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {executeScopedOperation} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';

/** Use the same persistent task + account ledger as the shipped business core. */
export async function executeMcpOperation(file, request, work, {signal} = {}) {
 const task=readTask(file);
 // Alpha journals did not reserve the account ledger. Never silently migrate them.
 if(task.mcpOperations?.length)throw new Error('旧 MCP 原型记录需独立核对迁移，不能直接续跑或重置');
 const check=()=>{
  if(signal?.aborted)throw Object.assign(new Error('操作已取消；已派发效果须核对，不自动重放'),{code:'MCP_CANCELLED'});
 };
 check();
 return executeScopedOperation(file,request,async()=>{
  check();
  const result=await work({signal,check});
  check();
  return result;
 });
}
