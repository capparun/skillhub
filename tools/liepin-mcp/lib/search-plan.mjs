import {plan} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/filters.js';
/** Task-specific, reviewed platform values are shared by every keyword round. */
export function composeKeywordRounds({keywords,platformFilters={},prefix='search',limit=20}){
 if(!Array.isArray(keywords)||!keywords.length||keywords.length>10||keywords.some(k=>typeof k!=='string'||!k.trim()))throw Error('需要1–10个明确关键词');
 if(!platformFilters||typeof platformFilters!=='object'||Array.isArray(platformFilters)||Object.keys(platformFilters).some(k=>['keyword','limit','pages'].includes(k)))throw Error('公共筛选不能覆盖关键词、页数或读取量');
 if(!/^[a-zA-Z0-9_-]{1,48}$/.test(prefix))throw Error('轮次前缀无效');
 return [...new Set(keywords.map(k=>k.trim()))].map((keyword,index)=>{
  const filters={...platformFilters,keyword,pages:1,limit};plan(filters);
  return {id:`${prefix}-${index+1}`,phase:'trial',filters};
 });
}
/** Explicit UI buckets form coverage segments; never treat one bucket as >=N. */
export function composeCoverageRounds({keywords,commonFilters={},segments,prefix='coverage',limit=20,maxRounds=10}){
 if(!segments||typeof segments!=='object'||Array.isArray(segments)||!Object.keys(segments).length)throw Error('需要明确的分段筛选字段与实际取值');
 if(!Number.isSafeInteger(maxRounds)||maxRounds<1||maxRounds>10)throw Error('单次方案最多1–10轮；超出时先拆分预算计划');
 let variants=[{}];
 for(const [field,values] of Object.entries(segments)){
  if(Object.hasOwn(commonFilters,field))throw Error('共同筛选与分段字段冲突：'+field);
  if(!Array.isArray(values)||!values.length||values.some(v=>typeof v!=='string'||!v.trim()))throw Error('分段选项必须是非空字符串列表');
  const unique=[...new Set(values.map(v=>v.trim()))];
  if(variants.length*unique.length>maxRounds)throw Error('覆盖组合超过单次方案预算，未生成或执行部分覆盖');
  variants=variants.flatMap(v=>unique.map(value=>({...v,[field]:value})));
 }
 if(!Array.isArray(keywords)||!keywords.length||keywords.length>10||keywords.some(k=>typeof k!=='string'||!k.trim()))throw Error('需要1–10个明确关键词');
 const uniqueKeywords=[...new Set(keywords.map(k=>k.trim()))];
 if(!uniqueKeywords.length||variants.length*uniqueKeywords.length>maxRounds)throw Error('关键词与分段组合超过单次方案预算');
 const rounds=variants.flatMap((variant,index)=>composeKeywordRounds({keywords:uniqueKeywords,platformFilters:{...commonFilters,...variant},prefix:`${prefix}-s${index+1}`,limit}));
 return {rounds,coverage:{segments:structuredClone(segments),commonFilters:structuredClone(commonFilters),plannedCombinations:rounds.length,executedCombinations:0,complete:false}};
}
