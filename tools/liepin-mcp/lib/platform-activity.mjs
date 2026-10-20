/** Historical receipts, never inferred current server state. */
export function platformActivity(task){
 const operations=task.operations??[];
 const schemes=operations.filter(o=>o.status==='completed'&&Array.isArray(o.evidence?.schemes)).at(-1);
 const schemeActions=operations.filter(o=>['save-search','delete-search','apply-search'].includes(o.kind));
 const favorites=operations.filter(o=>o.status==='completed'&&Array.isArray(o.evidence?.rows)&&(o.evidence.collection==='favorites'||o.evidence.rows.some(r=>r.collection==='favorites'))).at(-1);
 const favoriteActions=operations.filter(o=>['favorite','unfavorite'].includes(o.kind)||typeof o.evidence?.saved==='boolean'&&o.evidence?.resumeId);
 return {
  schemesRead:!!schemes,schemes:(schemes?.evidence.schemes??[]).map(s=>[s.name,s.subscribed===true?'已订阅':s.subscribed===false?'未订阅':'未提供',schemes.finishedAt??schemes.startedAt]),
  schemeActions:schemeActions.map(o=>[o.evidence?.name??'未提供',o.kind,o.status,o.evidence?.reason??'查看对应操作记录']),
  favoritesRead:!!favorites,favoritesTotal:favorites?.evidence.total??null,favorites:(favorites?.evidence.rows??[]).map(r=>[r.name,r.resumeId??'未确认稳定编号',r.summary]),
  favoriteActions:favoriteActions.map(o=>[o.evidence?.resumeId,o.kind,o.status,o.status==='completed'&&typeof o.evidence?.saved==='boolean'?(o.evidence.saved?'回读为已收藏':'回读为未收藏'):'结果未确认']),
  batches:(task.detailBatches??[]).map(b=>({id:b.id,status:b.status,completed:b.items.filter(i=>i.status==='completed').length,total:b.items.length,items:b.items.map(i=>[i.observationId,i.status,i.error??i.reason??'未记录异常'])})),
 };
}
