/** Validate the limited JSON Schema vocabulary used by our tool contracts. */
export function validate(value,schema,path='arguments'){
 const types=Array.isArray(schema.type)?schema.type:[schema.type];
 const matches=type=>type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):type==='array'?Array.isArray(value):type==='integer'?Number.isSafeInteger(value):typeof value===type;
 if(schema.type&&!types.some(matches))throw Error(`${path} 类型错误`);
 if(schema.enum&&!schema.enum.includes(value))throw Error(`${path} 不在允许值内`);
 if(typeof value==='string'&&schema.minLength!==undefined&&value.trim().length<schema.minLength)throw Error(`${path} 不可为空`);
 if(typeof value==='number'&&((schema.minimum!==undefined&&value<schema.minimum)||(schema.maximum!==undefined&&value>schema.maximum)))throw Error(`${path} 超出允许范围`);
 if(Array.isArray(value)){
  if((schema.minItems!==undefined&&value.length<schema.minItems)||(schema.maxItems!==undefined&&value.length>schema.maxItems))throw Error(`${path} 条目数超出允许范围`);
  if(schema.items)value.forEach((item,index)=>validate(item,schema.items,`${path}[${index}]`));
 }
 if(schema.type==='object'){
  for(const key of schema.required??[])if(!Object.hasOwn(value,key))throw Error(`缺少参数${key}`);
  for(const [key,child] of Object.entries(value)){
   if(!Object.hasOwn(schema.properties??{},key)){if(schema.additionalProperties===false)throw Error(`未知参数${key}`);continue;}
   validate(child,schema.properties[key],`${path}.${key}`);
  }
 }
}
