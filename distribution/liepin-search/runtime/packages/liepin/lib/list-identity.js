// Interpret only detail links actually present in a visible card. Search-context
// query parameters are not identity; conflicting IDs remain unresolved.
export function identifyListRow(row) {
 const ids=new Map();
 for(const href of row.detailLinks ?? []) {
  try {
   const url=new URL(href,'https://h.liepin.com');
   if(url.origin!=='https://h.liepin.com' || url.pathname!=='/resume/showresumedetail/' || url.username || url.password)continue;
   const values=url.searchParams.getAll('res_id_encode');
   if(values.length!==1 || !/^[A-Za-z0-9_-]{1,512}$/.test(values[0]))continue;
   ids.set(values[0],url.href);
  } catch { /* An invalid or non-detail link is not an identity. */ }
 }
 if(ids.size!==1)return {...row,identityEvidence:ids.size>1?'conflicting-detail-links':'no-detail-link'};
 const [resumeId,observedDetailUrl]=ids.entries().next().value;
 if(row.resumeId && row.resumeId!==resumeId)return {...row,identityEvidence:'conflicting-existing-id'};
 return {...row,resumeId,observedDetailUrl,identityEvidence:'visible-detail-link'};
}
