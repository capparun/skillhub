// Project observed fields only. No inferred roles, company sizes or business scores.
export function entityPresentation(entity, intent) {
 const fields={}, row={};
 for(const observation of [...entity.observations].sort((a,b)=>(a.observed_at??a.row.observed_at??'').localeCompare(b.observed_at??b.row.observed_at??''))){
  Object.assign(row,observation.row);
  for(const [key,field] of Object.entries(observation.row.fields??{}))fields[key]=field;
 }
 const value=key=>fields[key]?.status==='observed'?fields[key].value??'':'';
 const roles=Array.isArray(value('current_roles'))?value('current_roles'):[];
 const text=v=>typeof v==='string'||typeof v==='number'?String(v):'';
 const display={search_summary:text(value('search_summary')),name:entity.name,location:text(value('location'))||text(row.location),company:roles.map(r=>r.company).filter(Boolean).join('；'),title:roles.map(r=>r.title).filter(Boolean).join('；'),industry:text(value('industry'))||text(row.industry),headcount:text(value('employee_count_text')),about:text(value('about'))||text(row.about),headline:text(value('headline'))||text(row.headline)};
 return {fields,display,kind:intent==='people_discovery'?'person':intent==='company_discovery'?'company':'entity'};
}
export function reportColumns(intent){
 return [{key:'name',label:intent==='people_discovery'?'姓名':intent==='company_discovery'?'公司':'对象'},...(intent==='people_discovery'?[{key:'search_summary',label:'搜索卡片摘要（非详情核实）'},{key:'company',label:'当前公司（详情）'},{key:'title',label:'当前职位（详情）'},{key:'headline',label:'简介标题'}]:[{key:'industry',label:'行业'},{key:'headcount',label:'LinkedIn关联人数'}]),{key:'location',label:'所在地'},{key:'decision',label:'判断'},{key:'evidence',label:'判断依据 / 缺口'}];
}
