// Official bridge is the default. The existing experimental connection remains
// an explicit per-process option, not a required installation dependency.
const mode=process.env.HUNTER_LIEPIN_CONNECTION??'official';
if(!['official','official-managed','experimental'].includes(mode))throw new Error('HUNTER_LIEPIN_CONNECTION must be official, official-managed or experimental');
export const LIEPIN_MANAGED=mode==='official-managed';
export const LIEPIN_CONNECTION=mode==='experimental'?'hunter-mainframe-v1':'official';
export const LIEPIN_SESSION=LIEPIN_MANAGED?'liepin-official-search-read':mode==='official'?'liepin-official-mainframe':'liepin-compat-mainframe';
export const LIEPIN_MANAGED_SESSION='liepin-official-owned-search';
export const LIEPIN_DETAIL_SESSION='liepin-official-owned-detail';
export function matchesConnection(tab) {
 return LIEPIN_CONNECTION==='official'
  ? tab.connectionMode==null||tab.connectionMode==='official'
  : tab.connectionMode===LIEPIN_CONNECTION;
}
