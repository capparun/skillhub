// Interpret only identity that is actually present on screen. A detail link is
// the strongest source; the list row also carries the resume id in its class
// (tr.r-<resId>), which is read as a second, explicitly labelled source. Search
// context query parameters are never identity, and conflicting ids stay
// unresolved instead of being guessed.
const ID=/^[A-Za-z0-9_-]{1,512}$/;
export function identifyListRow(row) {
 const ids=new Map();
 for(const href of row.detailLinks ?? []) {
  try {
   const url=new URL(href,'https://h.liepin.com');
   if(url.origin!=='https://h.liepin.com' || url.pathname!=='/resume/showresumedetail/' || url.username || url.password)continue;
   const values=url.searchParams.getAll('res_id_encode');
   if(values.length!==1 || !ID.test(values[0]))continue;
   ids.set(values[0],url.href);
  } catch { /* An invalid or non-detail link is not an identity. */ }
 }
 const rowClassId=typeof row.rowClassResumeId==='string'&&ID.test(row.rowClassResumeId)?row.rowClassResumeId:null;
 if(ids.size>1)return {...row,identityEvidence:'conflicting-detail-links'};
 if(ids.size===1){
  const [resumeId,observedDetailUrl]=ids.entries().next().value;
  if(rowClassId&&rowClassId!==resumeId)return {...row,identityEvidence:'conflicting-row-class'};
  if(row.resumeId&&row.resumeId!==resumeId)return {...row,identityEvidence:'conflicting-existing-id'};
  return {...row,resumeId,observedDetailUrl,identityEvidence:'visible-detail-link'};
 }
 // No detail link in the card. The row class still names the resume, and it is
 // recorded as its own source so a caller can decide whether to trust it.
 if(rowClassId){
  if(row.resumeId&&row.resumeId!==rowClassId)return {...row,identityEvidence:'conflicting-existing-id'};
  return {...row,resumeId:rowClassId,observedDetailUrl:null,identityEvidence:'row-class'};
 }
 return {...row,identityEvidence:'no-detail-link'};
}
