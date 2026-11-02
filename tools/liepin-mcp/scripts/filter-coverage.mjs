// Offline acceptance accounting; never opens a browser or changes a task.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {filters} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/filters.js';
export function filterCoverage(tasks){
 const fields=Object.entries(filters).map(([key,[label,type]])=>({key,label,type,completedReadbacks:[],incompleteReadbacks:[]}));
 const byKey=new Map(fields.map(row=>[row.key,row]));
 for(const [taskIndex,task] of tasks.entries())for(const operation of task.operations??[]){
  if(!['prepare','search'].includes(operation.kind))continue;
  const finalReadbacks=operation.evidence?.applied;
  const readbacks=finalReadbacks??operation.filterProgress?.checked??[];
  for(const applied of readbacks){
   const row=byKey.get(applied.field);if(!row||typeof applied.value!=='string')continue;
   const receipt={taskIndex,operationId:operation.operationId,status:operation.status,value:applied.value};
   (operation.status==='completed'&&finalReadbacks?row.completedReadbacks:row.incompleteReadbacks).push(receipt);
  }
 }
 return {total:fields.length,covered:fields.filter(row=>row.completedReadbacks.length).length,fields,note:'仅统计所提供任务中的已完成回读记录；不证明当前页面状态、所有取值或真实环境。真实验收必须另外绑定候选指纹与会话证据。'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href){
 const files=process.argv.slice(2);if(!files.length)throw Error('用法：filter-coverage.mjs TASK.json [TASK.json ...]');
 console.log(JSON.stringify(filterCoverage(files.map(file=>JSON.parse(fs.readFileSync(file,'utf8')))),null,2));
}
