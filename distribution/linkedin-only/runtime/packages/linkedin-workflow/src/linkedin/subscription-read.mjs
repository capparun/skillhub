import {compile,runProcess} from './gateway.mjs';
import {createTransport} from '../opencli.mjs';
import {managedSessionTransport} from '../session-lifecycle.mjs';
import {withProfileLock} from '../profile-lock.mjs';
import {readSubscription} from '../identity.mjs';
import {profileSlug} from './profile-url.mjs';
const url='https://www.linkedin.com/premium/my-premium/';
const unknown=reason=>({status:'unknown',reason});
export function parsePremiumPage(data){
 const empty={subscription:unknown('plan_not_observed'),renewal:unknown('renewal_not_observed'),official_balance:unknown('balance_not_observed')};
 if(data.url!==url&&data.url!==url.slice(0,-1))return empty;
 const blocks=[...(data.snapshot??'').matchAll(/<p>Plan Details<\/p>\s*\n\s*<div \/>\s*\n\s*<p>([^<\n]+)<\/p>(?:\s*\n\s*<p>Renews on ([^<\n]+)<\/p>)?/g)];
 if(blocks.length!==1)return empty;
 const [,plan,date]=blocks[0];
 if(!/^(Sales Navigator (Core|Advanced|Advanced Plus)|Premium (Career|Business|All-in-One))$/.test(plan))return empty;
 return {...empty,subscription:{status:'observed',name:plan,source:url},renewal:date?{status:'observed',text:date,source:url,kind:'subscription_renewal_not_inmail_reset'}:empty.renewal};
}
export async function readAccountSubscription(account,options={}){
 const plan=compile({provider:'linkedin',operation:'account.inspect',account,input:{}},options);
 const run=options.run??runProcess;
 const owned=managedSessionTransport(options.transport??createTransport(),account.profile);
 const context={profile:account.profile,session:'subscription-read'};
 const verify=async()=>{const raw=await run(plan);const who=Array.isArray(raw.data)?raw.data.length===1?raw.data[0]:null:raw.data;if(raw.ok!==true||who?.logged_in!==true||who.name!==account.expected_identity||who.public_id!==profileSlug(account.expected_profile_url))throw Object.assign(new Error('identity_unconfirmed'),{code:'identity_unconfirmed'});};
 return withProfileLock(account.profile,async()=>{
  let result;
  try{
   await verify();await owned.transport.open(url,context);
   const page=await owned.transport.state(context);
   if(/\/(checkpoint|challenge|login|authwall)(\/|\?|$)/.test(page.url??''))throw Object.assign(new Error('verification_required'),{code:'verification_required'});
   result=parsePremiumPage(page);
   if(result.subscription.name?.startsWith('Sales Navigator ')){
    await owned.transport.open('https://www.linkedin.com/sales/settings/sellers-profile',context);
    const snPage=await owned.transport.state(context);
    if(/\/(checkpoint|challenge|login|authwall)(\/|\?|$)/.test(snPage.url??''))throw Object.assign(new Error('verification_required'),{code:'verification_required'});
    const sn=readSubscription(snPage);
    if(sn?.subscription.name===result.subscription.name)result.official_balance=sn.official_balance;
    else if(sn)result.official_balance=unknown('conflicting_subscription_pages');
   }
   await verify();
  }finally{const cleanup=await owned.cleanup();if(cleanup.status==='failed')throw Object.assign(new Error('cleanup_failed'),{code:'cleanup_failed'});}
  return {...result,checked_at:new Date().toISOString(),identity_match:true,reusable_authorization:false};
 });
}
