/** Split only explicit standalone date ranges; retain every original line. */
export function sectionEntries(section){
 const text=String(section.text??'');
 const lines=text.split('\n');
 const date=/^[（(]?\s*\d{4}[.年/-]\d{1,2}(?:月)?\s*[-—–至]\s*(?:\d{4}[.年/-]\d{1,2}(?:月)?|至今|现在)(?:\s*[,，].*)?[）)]?\s*$/;
 const boundaries=[];
 for(let i=1;i<lines.length;i++)if(date.test(lines[i].trim())&&lines[i-1].trim())boundaries.push(i-1);
 if(!boundaries.length)return [{title:'未自动拆分',period:null,text}];
 const result=[];
 if(boundaries[0]>0&&lines.slice(0,boundaries[0]).join('\n').trim())result.push({title:'栏目原文',period:null,text:lines.slice(0,boundaries[0]).join('\n')});
 boundaries.forEach((start,index)=>result.push({title:lines[start].trim(),period:lines[start+1].trim(),text:lines.slice(start,boundaries[index+1]??lines.length).join('\n')}));
 return result;
}

/** Surface saved text outside parsed sections without inventing personal fields. */
export function unclassifiedSegments(detail){
 const lines=String(detail.text??'').split('\n'),covered=new Set();
 for(const section of detail.sections??[]){
  const start=section.startLine-1,end=section.endLine;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>lines.length)continue;
  if(lines.slice(start,end).join('\n').trim()!==String(section.text??'').trim())continue;
  for(let i=start;i<end;i++)covered.add(i);
  const heading=lines[start-1].trim().replace(/\s+/g,'').replace(/[：:]$/,'').replace(/[（(]共\d+段[）)]$/,'');
  if(({'我的技能':'技能特长','附加消息':'附加信息'}[heading]??heading)===section.heading)covered.add(start-1);
 }
 const segments=[];
 for(let i=0;i<lines.length;){
  if(covered.has(i)){i++;continue;}
  const start=i;while(i<lines.length&&!covered.has(i))i++;
  const text=lines.slice(start,i).join('\n');
  if(text.trim())segments.push({startLine:start+1,endLine:i,text});
 }
 return segments;
}
