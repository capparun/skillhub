import {extractTargetCompanyId} from './company-page.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function companySlug(value){
  if(typeof value!=='string')fail('invalid_company');
  const text=value.trim();
  const match=text.match(/^https:\/\/www\.linkedin\.com\/company\/([\w%-]+)\/?$/);
  const slug=match?match[1]:text;
  if(!/^[\w%-]+$/.test(slug))fail('invalid_company');
  return slug;
}
export async function resolveCompanyPage(page,company,{timeoutMs=12000,pollMs=250,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  const slug=companySlug(company);const start=now();
  while(now()-start<timeoutMs){
    const observed=await page.evaluate(()=>({url:location.href,title:document.title,html:document.documentElement.innerHTML}));
    let url;try{url=new URL(observed.url);}catch{fail('company_identity_unconfirmed');}
    if(/\/checkpoint|\/login|\/authwall/.test(url.pathname))fail('company_access_blocked');
    if(url.hostname!=='www.linkedin.com'||!new RegExp('^/company/'+slug.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/(?:(?:about|home)/?)?$','i').test(url.pathname))fail('company_identity_unconfirmed');
    const topCards=[...new Set([...String(observed.html).matchAll(/\b(?:id|componentkey)=["']pages\.topCard\.(\d+)["']/g)].map(m=>m[1]))];
    if(topCards.length>1)fail('company_id_ambiguous');
    const companyId=extractTargetCompanyId(observed.html);
    if(companyId)return {success:true,company:slug,companyId,currentUrl:observed.url,title:observed.title,identity_source:topCards.length?'page_top_card':'page_embedded_identifier',elapsed_ms:now()-start};
    await wait(pollMs);
  }
  fail('company_id_unconfirmed');
}
