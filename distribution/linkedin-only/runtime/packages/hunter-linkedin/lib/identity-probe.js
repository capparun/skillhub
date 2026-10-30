const fail=code=>{throw Object.assign(Error(code),{code});};
export function validateIdentityTarget(value){
 let url;try{url=new URL(value);}catch{fail('invalid_identity_target');}
 // Profile slugs may be non-ASCII (e.g. /in/妍-王-a52634337/) or percent-encoded.
 if(url.origin!=='https://www.linkedin.com'||url.username||url.password||url.search||url.hash||!/^\/(?:in\/[^/?#]+\/|company\/[^/?#]+\/|search\/results\/people\/)$/.test(url.pathname))fail('invalid_identity_target');
 return url.href;
}
export async function probeIdentity(page,target){
 target=validateIdentityTarget(target);
 const cookies=await page.getCookies({url:'https://www.linkedin.com'});
 if(!cookies.some(c=>c.name==='li_at'&&c.value))fail('not_logged_in');
 const current=await page.evaluate('({origin:location.origin,path:location.pathname})');
 if(current?.origin!=='https://www.linkedin.com')await page.goto(target,{waitUntil:'domcontentloaded',timeout:60000});
 else if(/^\/(login|checkpoint|authwall)(\/|$)/.test(current.path))fail('login_required');
 const result=await page.evaluate(`(async()=>{
  if(location.origin!=='https://www.linkedin.com'||/^\\/(login|checkpoint|authwall)(\\/|$)/.test(location.pathname))return {error:'login_required'};
  const cookie=(document.cookie.split('; ').find(c=>c.startsWith('JSESSIONID='))||'').slice('JSESSIONID='.length);
  const csrf=cookie.replace(/^"|"$/g,'');if(!csrf)return {error:'not_logged_in'};
  const response=await fetch('/voyager/api/me',{credentials:'include',headers:{'csrf-token':csrf,Accept:'application/json'}});
  if(response.status===401||response.status===403)return {error:'not_logged_in'};
  if(!response.ok)return {error:'identity_probe_failed'};
  const data=await response.json(),mini=data?.miniProfile;
  if(!mini?.publicIdentifier)return {error:'identity_unconfirmed'};
  const first=mini.firstName?.text??mini.firstName??'',last=mini.lastName?.text??mini.lastName??'';
  return {logged_in:true,public_id:String(mini.publicIdentifier),name:String(first+' '+last).trim()};
 })()`);
 if(result?.error)fail(result.error);
 if(result?.logged_in!==true||!result.public_id||!result.name)fail('identity_unconfirmed');
 return result;
}
