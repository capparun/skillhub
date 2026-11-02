import {filters} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/filters.js';
const snake=key=>key.replace(/[A-Z]/g,char=>'_'+char.toLowerCase());
const names=new Map(Object.keys(filters).map(key=>[snake(key),key]));
export const adapterFilterProperties=Object.fromEntries(Object.entries(filters).map(([key,[label,kind]])=>[snake(key),{type:kind==='check'?'boolean':'string',help:label}]));
export function coreFilters(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('筛选条件必须为对象');
 return Object.fromEntries(Object.entries(input).map(([key,value])=>{
  if(!names.has(key))throw Error('未知 Adapter 筛选字段：'+key);
  return [names.get(key),value];
 }));
}
