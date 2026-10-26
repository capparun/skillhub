import { blockingDialogExpression } from './page-safety.mjs';
import { RANGE_FIELDS } from './range-fields.mjs';
const fail = () => { throw Object.assign(new Error('invalid_input'), {code:'invalid_input'}); };
export const TYPED_FIELDS = {account:{},lead:{}};
for (const [type, field] of Object.entries(RANGE_FIELDS)) TYPED_FIELDS.account[type.toLowerCase()]={...field,query_type:type,source:'range',modes:[]};
for (const [key,type,label,id] of [
 ['following_your_company','FOLLOWS_YOUR_COMPANY','Following your company','CF'],
 ['viewed_your_profile_recently','VIEWED_YOUR_PROFILE','Viewed your profile recently','VYP'],
 ['past_colleague','PAST_COLLEAGUE','Past colleague','PCOLL'],
 ['shared_experiences','WITH_SHARED_EXPERIENCES','Shared experiences','COMM'],
 ['changed_jobs','RECENTLY_CHANGED_JOBS','Changed jobs','RPC'],
 ['posted_on_linkedin','POSTED_ON_LINKEDIN','Posted on LinkedIn','RPOL'],
]) TYPED_FIELDS.lead[key]={label,query_type:type,source:'boolean',id,modes:[]};
for(const [key,label] of [['first_name','First name'],['last_name','Last name']]) TYPED_FIELDS.lead[key]={label,query_type:key.toUpperCase(),source:'text',modes:[]};
for(const [kind,key,type,label] of [['account','companies_in_crm','ACCOUNTS_IN_CRM','Companies in CRM'],['lead','people_in_crm','LEADS_IN_CRM','People in CRM']]) TYPED_FIELDS[kind][key]={label,query_type:type,source:'restricted',modes:[]};
export function normalizeTyped(schema,value) {
 if(schema.source==='restricted') throw Object.assign(new Error('Account integration is unavailable; no query was dispatched.'),{code:'feature_restricted'});
 if(schema.source==='boolean') { if(typeof value!=='boolean') fail();return value; }
 if(schema.source==='text') {if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>200||/[\u0000-\u001f]/.test(value))fail();return value;}
 const sub=schema.query_type==='ANNUAL_REVENUE'?'currency':schema.query_type.startsWith('DEPARTMENT_')?'department':null;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['min','max',...(sub?[sub]:[])].includes(k))||value.min===undefined&&value.max===undefined)fail();
 for(const k of ['min','max']) if(value[k]!==undefined&&(!Number.isFinite(value[k])||!schema.query_type.includes('GROWTH')&&value[k]<0))fail();
 if(value.min!==undefined&&value.max!==undefined&&value.min>value.max)fail();
 if(schema.query_type==='ANNUAL_REVENUE'&&(['min','max'].some(k=>value[k]!==undefined&&!(k==='min'?[0,0.5,1,2.5,5,10,20,50,100,500,1000]:[0.5,1,2.5,5,10,20,50,100,500,1000,1001]).includes(value[k]))))fail();
 if(sub&&!schema.sub_options.some(o=>o.value&& (sub==='currency'?o.value:o.label)===value[sub]))fail();
 return {...value};
}
export function typedQuery(schema,value) {
 const type=schema.query_type;
 if(schema.source==='boolean')return value?{type,values:[{id:schema.id,selectionType:'INCLUDED'}]}:null;
 if(schema.source==='text')return {type,values:[{text:value,selectionType:'INCLUDED'}],text_only:true};
 const rangeValue=Object.fromEntries(['min','max'].filter(k=>value[k]!==undefined).map(k=>[k,String(value[k])]));
 const selectedSubFilter=value.currency??(value.department?schema.sub_options.find(o=>o.label===value.department)?.value:undefined);
 return {type,rangeValue,...(selectedSubFilter!==undefined?{selectedSubFilter}:{})};
}
export function typedControlScript(schema,value,write=false) {
 return `(()=>{if (${blockingDialogExpression}) return {verified:false,reason:'page_blocked'};const type=${JSON.stringify(schema.query_type)},source=${JSON.stringify(schema.source)},value=${JSON.stringify(value)};const roots=[...document.querySelectorAll('fieldset[data-x-search-filter]')].filter(e=>e.getAttribute('data-x-search-filter')===type);if(roots.length!==1)return {verified:false};const root=roots[0];
 const set=(e,v)=>{if(!e||e.disabled||!e.getClientRects().length)return false;if(${write}){Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,String(v));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}return e.value===String(v)};
 if(source==='boolean'){const e=root.querySelector('input[type="checkbox"]');return {verified:!!e&&e.checked===value,checked:e?.checked};}
 if(source==='text'){const e=root.querySelector('input');const verified=set(e,value);if(${write}&&verified)e.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',keyCode:13,which:13,bubbles:true}));return {verified};}
 if(source==='range'){let verified=true;const sub=value.currency??value.department;if(sub!==undefined){const s=root.querySelector('select');const o=[...s?.options??[]].find(o=>value.currency?o.value===sub:o.text===sub);verified=!!o&&set(s,o.value);}
 for(const k of ['min','max']){if(value[k]===undefined)continue;const e=type==='ANNUAL_REVENUE'?root.querySelector('select[aria-label^="'+(k==='min'?'Minimum':'Maximum')+'"]'):root.querySelector('input[id^="range-filter-'+k+'-"]');verified=set(e,value[k])&&verified;}return {verified};}return {verified:false};})()`;
}
