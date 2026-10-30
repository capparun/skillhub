import {extractTargetCompanyId} from './company-page.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};

// Accept a school slug (fudan-university) or a full /school/<slug>/ URL with an
// optional /home or /about suffix, which LinkedIn appends on redirect.
export function schoolSlug(value){
  if(typeof value!=='string')fail('invalid_school');
  const text=value.trim();
  if(!text)fail('invalid_school');
  const urlMatch=text.match(/^https:\/\/www\.linkedin\.com\/school\/([\w%-]+)(?:\/(?:home|about))?\/?$/);
  const slug=urlMatch?urlMatch[1]:text;
  if(!/^[\w%-]+$/.test(slug))fail('invalid_school');
  return slug;
}

export async function resolveSchoolPage(page,school,{timeoutMs=12000,pollMs=250,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  const slug=schoolSlug(school);
  const expected=new RegExp('^/school/'+slug.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/(?:(?:home|about)/?)?$','i');
  const start=now();
  while(now()-start<timeoutMs){
    const observed=await page.evaluate(()=>({url:location.href,title:document.title,html:document.documentElement.innerHTML}));
    let url;try{url=new URL(observed.url);}catch{fail('school_identity_unconfirmed');}
    if(/\/checkpoint|\/login|\/authwall/.test(url.pathname))fail('school_access_blocked');
    if(url.hostname!=='www.linkedin.com'||!expected.test(url.pathname))fail('school_identity_unconfirmed');
    const topCards=[...new Set([...String(observed.html).matchAll(/\b(?:id|componentkey)=["']pages\.topCard\.(\d+)["']/g)].map(match=>match[1]))];
    if(topCards.length>1)fail('school_id_ambiguous');
    const schoolId=extractTargetCompanyId(observed.html);
    if(schoolId)return {success:true,school:slug,schoolId,currentUrl:observed.url,title:observed.title,identity_source:topCards.length?'page_top_card':'page_embedded_identifier',elapsed_ms:now()-start};
    await wait(pollMs);
  }
  fail('school_id_unconfirmed');
}
