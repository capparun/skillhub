// Liepin adds #session after submitting filters. This fragment does not change
// the search resource. Never generalize this to arbitrary paths or query strings.
export function allowedSearchUrls(value) {
  const url=new URL(value);
  if(url.origin!=='https://h.liepin.com' || url.pathname!=='/search/getConditionItem'
    || url.username || url.password || !['','#session'].includes(url.hash)) {
    throw new Error('仅允许已打开的猎聘搜索页及已观察到的 #session 状态');
  }
  url.hash='';const base=url.href;
  return [base,`${base}#session`];
}
