/** Only link an observed, identity-consistent platform detail URL. */
export function observedResumeUrl(candidate){
 for(const observation of [...(candidate.observations??[])].reverse()){
  if(observation.stage!=='detail'||typeof observation.data?.url!=='string')continue;
  try{
   const url=new URL(observation.data.url);
   if(candidate.source==='liepin'&&url.origin==='https://h.liepin.com'&&!url.username&&!url.password&&url.pathname==='/resume/showresumedetail/'&&url.searchParams.getAll('res_id_encode').length===1&&url.searchParams.get('res_id_encode')===candidate.identity)return url.href;
  }catch{}
 }
 return null;
}
