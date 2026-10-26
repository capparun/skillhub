import { blockingDialogExpression } from './page-safety.mjs';

// Native controls are not required to have IDs. Build one exact current-DOM
// path when no ID exists; never broaden to a text match or the parent option.
const selectorScript = `const selectorFor=e=>{
  if(e.id)return '[id='+JSON.stringify(e.id)+']';
  const name=e.getAttribute('aria-label');
  if(name){
    const role=e.getAttribute('role');
    return e.tagName.toLowerCase()+(role?'[role='+JSON.stringify(role)+']':'')+'[aria-label='+JSON.stringify(name)+']';
  }
  const path=[];
  for(let node=e;node&&node.nodeType===1;node=node.parentElement){
    const tag=node.tagName.toLowerCase();
    const siblings=node.parentElement?[...node.parentElement.children].filter(x=>x.tagName===node.tagName):[node];
    path.unshift(tag+':nth-of-type('+(siblings.indexOf(node)+1)+')');
  }
  return path.join(' > ');
};`;

// Platform counts may change between discovery and dispatch. Match the exact
// field/mode and canonical UI label, ignoring only an observed numeric suffix.
export function filterSelectionScript(field, label, mode, { prepare = false } = {}) {
  return `(() => {
    if (${blockingDialogExpression}) return {resolved:false,matches_n:0,reason:'page_blocked'};
    const field=${JSON.stringify(field)}, label=${JSON.stringify(label)}, mode=${JSON.stringify(mode)};
    const canonical=text=>text.replace(/ \\([\\d,.KM+]+\\)$/, '');
    const prefix=mode==='exclude'?'Exclude “':'Include “';
    const suffix=(mode==='exclude'?'” from ':'” in ')+field+' filter';
    const role=mode==='exclude'?'button':'option';
    const matches=[...document.querySelectorAll('[role="'+role+'"]'+(role==='button'?',button':''))].filter(e=>{
      const name=e.getAttribute('aria-label')??'';
      return name.startsWith(prefix)&&name.endsWith(suffix)
        &&canonical(name.slice(prefix.length,-suffix.length))===canonical(label)
        &&e.getClientRects().length>0&&!e.disabled&&e.getAttribute('aria-disabled')!=='true';
    });
    if(matches.length!==1)return {resolved:false,matches_n:matches.length};
    ${selectorScript}
    // Some entity options are containers; only their explicit Include button
    // applies the filter. Keep the exact field/name match within this option.
    const option=matches[0];
    const actions=mode==='include'&&option.querySelectorAll
      ? [...option.querySelectorAll('[role="button"],button')].filter(e=>
          e.getAttribute('aria-label')===option.getAttribute('aria-label')
          &&e.getClientRects().length>0&&!e.disabled&&e.getAttribute('aria-disabled')!=='true')
      : [];
    if(actions.length>1)return {resolved:false,matches_n:actions.length};
    const target=actions[0]??option;
    ${prepare ? `
    if(document.visibilityState!=='visible')return {resolved:false,matches_n:1,reason:'window_not_visible'};
    target.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    const rect=target.getBoundingClientRect();
    let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(innerWidth,rect.right),bottom=Math.min(innerHeight,rect.bottom);
    for(let p=target.parentElement;p;p=p.parentElement){
      const style=getComputedStyle(p),r=p.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,r.left);right=Math.min(right,r.right);}
      if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}
    }
    if(right<=left||bottom<=top)return {resolved:false,matches_n:1,reason:'option_not_visible'};
    const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
    if(!hit||hit!==target&&!target.contains(hit))return {resolved:false,matches_n:1,reason:'option_obscured'};
    ` : ''}
    const selector=selectorFor(target);
    return selector?{resolved:true,matches_n:1,selector}:{resolved:false,matches_n:1};
  })()`;
}

// Resolve from the current DOM. Semantic OpenCLI clicks first translate names
// to snapshot refs; an asynchronous results redraw can reidentify those refs
// against another filter control before dispatch.
export function filterExpansionScript(field) {
  return `(() => {
    if (${blockingDialogExpression}) return {resolved:false,reason:'page_blocked'};
    const name=${JSON.stringify('Expand ' + field + ' filter')};
    const matches=[...document.querySelectorAll('button')].filter(e=>
      (e.getAttribute('aria-label')??e.textContent).replace(/\\s+/g,' ').trim()===name
      &&e.getClientRects().length>0&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');
    if(matches.length!==1)return {resolved:false,matches_n:matches.length};
    ${selectorScript}
    const selector=selectorFor(matches[0]);
    return selector?{resolved:true,selector}:{resolved:false};
  })()`;
}

export async function expandFilter(transport, field, context) {
  // Keep resolution and dispatch separately visible to the execution budget.
  let selector;
  if (transport.resolveFilterExpansion) {
    const target = await transport.resolveFilterExpansion(field, context);
    if (!target.resolved || typeof target.selector !== 'string') throw Object.assign(new Error('Filter expansion target not confirmed.'), {code: target.reason === 'page_blocked' ? 'page_blocked' : 'page_changed'});
    selector = target.selector;
  }
  return transport.expandFilter(field, context, selector);
}
