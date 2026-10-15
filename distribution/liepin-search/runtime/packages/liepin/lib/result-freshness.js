function signature(state) {
  return JSON.stringify({count:state.count,total:state.total,empty:!!state.empty,page:state.pagination?.current,rows:state.rows});
}
// Read-only polling. New completed search response timing can prove freshness
// even when the visible cards are identical. No request bodies are inspected.
// If the loading transition was too fast to observe and content is unchanged,
// return uncertainty rather than submit again.
export async function waitForFreshResults(read,baseline,{pause,attempts=10}) {
  const before=signature(baseline);let loadingSeen=false;
  for(let attempt=0;attempt<attempts;attempt++) {
    const state=await read();loadingSeen ||= !!state.loading;
    const newResponse=Number.isFinite(state.searchResponseEnd) && Number.isFinite(baseline.searchResponseEnd)
      && state.searchResponseEnd>baseline.searchResponseEnd;
    if(!state.loading && (state.count>0 || state.empty) && (loadingSeen || newResponse || signature(state)!==before))return state;
    if(attempt<attempts-1)await pause(1000);
  }
  const error=new Error('提交后没有确认新结果；保留未知状态，不自动重新提交');error.code='TIMEOUT';throw error;
}
