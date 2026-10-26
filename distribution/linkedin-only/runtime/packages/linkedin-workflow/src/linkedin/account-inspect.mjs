import {readAccountSubscription} from './subscription-read.mjs';
import {execute,compile} from './gateway.mjs';
import {routeOptions} from './route-options.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const unknown=reason=>({status:'unknown',reason});
// Only deterministic diagnostics are used. This never tests access by sending
// messages or running a discovery query, and never consults configured tiers.
export async function inspectAccount(input,options={}){
 if(!input||!Array.isArray(input.candidates)||!input.candidates.length||input.candidates.length>20)fail('invalid_account_inspection');
 if(input.include_subscription!==undefined&&typeof input.include_subscription!=='boolean')fail('invalid_account_inspection');
 const account=input.account;
 const candidates=input.candidates.map(c=>({...c,account}));
 const runnable=candidates.filter(c=>{try{compile(c,options);return true;}catch{return false;}});
 const providers=[...new Set(runnable.map(c=>c.provider))];
 const receipts=[],observations=[];let halted=false;
 const run=options.execute??execute;
 for(const provider of providers){
  if(halted)break;
  let receipt;
  try { receipt=await run({provider,operation:'account.inspect',account,input:{}},options); }
  catch(error){receipt={provider,operation:'account.inspect',status:'blocked',error:{code:typeof error.code==='string'&&/^[a-z_]+$/.test(error.code)?error.code:'account_check_failed'}};}
  receipts.push(receipt);
  const d=receipt.data??{},checked=new Date().toISOString();
  const blocked=receipt.status==='blocked';
  for(const c of runnable.filter(c=>c.provider===provider)){
   let access=unknown('operation_not_probed');
   if(blocked)access={status:'blocked',reason:receipt.error?.code??'account_unconfirmed'};
   else if(c.operation==='account.inspect')access={status:'available',reason:'identity_verified'};
   else if(provider==='salesnav'){
    // Search UI access is not proof of company/person details, API or sending.
    const field=({'company.search':'account_search_access','person.search':'lead_search_access'})[c.operation];
    if(field)access=d[field]??access;
   }
   observations.push({provider,operation:c.operation,profile:account.profile,identity_url:account.expected_profile_url,status:access.status,reason:access.reason,source:'automatic_account_diagnostic',observed_at:checked,expires_at:new Date(Date.parse(checked)+60000).toISOString()});
  }
  halted=blocked||Object.values(d).some(v=>v&&['verification_required','rate_limited','login_required','access_denied'].includes(v.reason));
 }
 let subscriptionResult=null;
 if(input.include_subscription===true&&!halted&&runnable.length>0){
  try{subscriptionResult=await (options.readSubscription??readAccountSubscription)(account,options);}
  catch(e){halted=true;receipts.push({provider:'linkedin',operation:'subscription.read',status:'blocked',error:{code:e.code??'subscription_check_failed'}});}
 }
 const sn=receipts.find(r=>r.provider==='salesnav'&&r.status!=='blocked')?.data;
 return {schema_version:1,account,checked_at:new Date().toISOString(),status:halted?'blocked':'inspected',diagnostic_dispatched:receipts.length>0,business_operations_dispatched:false,renewal:subscriptionResult?.renewal??unknown('not_observed'),subscription:subscriptionResult?.subscription??sn?.subscription??unknown('ordinary_subscription_reader_not_integrated'),official_balance:subscriptionResult?.official_balance??sn?.official_balance??unknown('balance_not_observed'),nominal_quota:sn?.nominal_quota??unknown('not_observed'),observations,routes:routeOptions({candidates,observations},options),receipts,limitations:['ordinary identity check does not prove search or messaging entitlement','RPS unsupported','balance is a point-in-time observation, not sending permission']};
}
