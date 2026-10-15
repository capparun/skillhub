import {LIEPIN_SESSION,LIEPIN_MANAGED,LIEPIN_MANAGED_SESSION} from './connection.js';

// A managed search is an official owned lease, not a borrowed user tab.
// Releasing an owned lease resets its preferred tab, so the metadata manager
// retains it. Search/detail reading uses borrowed leases and releases them
// normally. Only explicit disconnect releases the owned manager.
export function retainOwnedSearch(page) {
 page.closeWindow=async()=>{};
 return page;
}
export async function createLiepinPage({session=LIEPIN_SESSION,createPage,retain=true}={}) {
 if(!createPage) {
  const {Page}=await import('@jackwener/opencli/browser/page');
  createPage=(...args)=>new Page(...args);
 }
 const owned=LIEPIN_MANAGED && session===LIEPIN_MANAGED_SESSION;
 // The official bridge honors siteSession=persistent on adapter leases only.
 // Browser leases still expire and reset their owned tab to about:blank.
 const page=createPage(session,undefined,undefined,LIEPIN_MANAGED?'foreground':'background',owned?'adapter':'browser','persistent');
 return owned && retain?retainOwnedSearch(page):page;
}
