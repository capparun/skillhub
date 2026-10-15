import {allowedSearchUrls} from './search-url.js';
// Development primitive. Used by the task search command with
// persistent task/site operation guards are integrated. A CDP acknowledgment
// is not evidence that a business action succeeded.

// Fixed read-only function, serialized by OpenCLI Page.evaluate. Never install
// marker attributes, overwrite browser properties, scroll, focus or click here.
export function inspectActionTarget({selector, expectedUrl, expectedUrls=[expectedUrl], purpose='click'}) {
  if (!expectedUrls.includes(location.href) || location.origin !== 'https://h.liepin.com') {
    return {status:'blocked', reason:'page_changed'};
  }
  const text=document.body?.innerText ?? '';
  if (/验证码|访问过于频繁|操作频繁|安全验证|异常访问|账号异常/.test(text)) {
    return {status:'blocked',reason:'risk_signal'};
  }
  if (/请登录|扫码登录/.test(text)) return {status:'blocked',reason:'login_required'};
  if (document.readyState !== 'complete') return {status:'blocked',reason:'page_loading'};
  if(purpose==='page')return {status:'ready',url:location.href,x:innerWidth/2,y:innerHeight/2};
  const matches=document.querySelectorAll(selector);
  if (matches.length !== 1) return {status:'blocked',reason:'target_not_unique'};
  const element=matches[0], style=getComputedStyle(element), rect=element.getBoundingClientRect();
  if (element.disabled || element.getAttribute('aria-disabled') === 'true'
      || element.closest('[inert]') || style.visibility !== 'visible'
      || style.display === 'none' || Number(style.opacity) === 0
      || rect.width <= 0 || rect.height <= 0) return {status:'blocked',reason:'target_unavailable'};
  const x=rect.x+rect.width/2, y=rect.y+rect.height/2;
  const inViewport=x>=0 && y>=0 && x<innerWidth && y<innerHeight;
  if(purpose==='scroll')return {status:'ready',url:location.href,x,y,inViewport};
  if (!inViewport) return {status:'blocked',reason:'target_outside_viewport'};
  const hit=document.elementFromPoint(x,y);
  if (hit?.closest?.('.ant-spin-blur')) return {status:'blocked',reason:'page_loading'};
  if (!hit || !(hit===element || element.contains(hit))) return {status:'blocked',reason:'target_covered',geometry:{
    x,y,width:rect.width,height:rect.height,viewportWidth:innerWidth,viewportHeight:innerHeight,
    targetTag:element.tagName??null,hitTag:hit?.tagName??null,
    hitClass:typeof hit?.className==='string'?hit.className.slice(0,160):null,
  }};
  if(purpose==='fill') {
    if(!['INPUT','TEXTAREA'].includes(element.tagName) || element.readOnly
       || (element.tagName==='INPUT' && !['text','search','tel','url','number'].includes(element.type))) {
      return {status:'blocked',reason:'unsupported_input'};
    }
    // Password entry is deliberately not part of this search driver.
    if(document.activeElement!==element)return {status:'blocked',reason:'input_not_focused'};
    return {status:'ready',url:location.href,x,y,value:element.value,inputType:element.type,
      selectionStart:element.selectionStart,selectionEnd:element.selectionEnd};
  }
  return {status:'ready',url:location.href,x,y};
}

export class ActionStoppedError extends Error {
  constructor(reason, outcome) {
    super(`页面操作已停止：${reason}；先核对结果，不自动重试`);
    this.name='ActionStoppedError';this.reason=reason;this.outcome=outcome;
  }
}

// Supplied Page must already be bound to an observed target. Callers must own a
// persistent operation reservation for the whole sequence. This instance's
// latch is only an additional guard, not a cross-process lock or retry journal.
export function createNativeActions(page, {expectedUrl}) {
  const url=new URL(expectedUrl);
  if (url.origin !== 'https://h.liepin.com' || url.username || url.password
      || url.pathname !== '/search/getConditionItem') throw new Error('仅允许已打开的猎聘搜索页');
  return createNativeActionSequence(page,{expectedUrl,expectedUrls:allowedSearchUrls(expectedUrl),inspectTarget:inspectActionTarget});
}

// Injectable mechanics allow browser acceptance on an owned fixture without
// weakening the production Liepin URL guard above. No CLI accepts an evaluator.
export function createNativeActionSequence(page,{expectedUrl,expectedUrls=[expectedUrl],inspectTarget,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  if (!page || typeof page.evaluate !== 'function' || typeof page.cdp !== 'function') throw new Error('缺少 OpenCLI 页面通道');
  if(typeof inspectTarget!=='function')throw new Error('缺少固定页面检查器');
  let stopped=false, active=false, acknowledgedActions=0;
  const used=new Set();
  const perform=async({actionId,selector},purpose,execute)=>{
      if (stopped || active) throw new ActionStoppedError('session_stopped_or_busy','not_started');
      if (typeof actionId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(actionId)
          || typeof selector !== 'string' || !selector.trim() || selector.length>2000) throw new Error('动作需要明确 ID 和已观察到的选择器');
      if (used.has(actionId)) throw new ActionStoppedError('duplicate_action','not_started');
      used.add(actionId);active=true;
      let dispatched=false;
      let repositioned=false;
      try {
        // A control the caller already scrolled into view can be pushed back
        // below the fold before this action dispatches (an opening dropdown
        // panel, a re-render, a sticky reflow). Reposition once with the same
        // scroll mechanism scrollTo uses and re-observe at fresh geometry.
        // A scroll is not a business dispatch: it goes through raw page.cdp so
        // a target that remains outside still fails closed with the original
        // reason, zero input events and outcome not_started. Never runs after
        // any dispatch, so no dispatched action is ever replayed.
        const reposition=async()=>{
          const doc=await page.cdp('DOM.getDocument',{depth:0});
          if(!Number.isInteger(doc?.root?.nodeId))throw new ActionStoppedError('document_unavailable','not_started');
          const matches=await page.cdp('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector});
          if(matches?.nodeIds?.length!==1)throw new ActionStoppedError('target_not_unique','not_started');
          await page.cdp('DOM.scrollIntoViewIfNeeded',{nodeId:matches.nodeIds[0]});
          repositioned=true;
        };
        const inspect=async()=>{
          let target=await page.evaluate(inspectTarget,{selector,expectedUrl,expectedUrls,purpose});
          if(!dispatched && purpose==='click' && !repositioned
              && target?.status==='blocked' && target.reason==='target_outside_viewport') {
            await reposition();
            target=await page.evaluate(inspectTarget,{selector,expectedUrl,expectedUrls,purpose});
          }
          // Loading caused by an earlier filter is expected. Observe up to
          // 20 seconds before any input dispatch; never replay dispatched input.
          if(!dispatched && target?.status==='blocked' && target.reason==='target_covered') {
            await pause(400);
            target=await page.evaluate(inspectTarget,{selector,expectedUrl,expectedUrls,purpose});
          }
          for(let attempt=0;!dispatched && attempt<40 && target?.status==='blocked' && target.reason==='page_loading';attempt++) {
            await pause(500);
            target=await page.evaluate(inspectTarget,{selector,expectedUrl,expectedUrls,purpose});
          }
          if (target?.status !== 'ready' || !expectedUrls.includes(target.url)
              || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
            const error=new ActionStoppedError(target?.reason ?? 'invalid_target_evidence',dispatched?'unknown':'not_started');
            if(target?.geometry)error.geometry=target.geometry;
            throw error;
          }
          return target;
        };
        const target=await inspect();
        // Direct public CDP method: no BasePage.click/clickWithQuads fallback,
        // no mutation inside evaluate, and no second attempt on any exception.
        const dispatch=async(method,params)=>{dispatched=true;return page.cdp(method,params);};
        await execute({target,inspect,dispatch});
        acknowledgedActions++;
        return {status:'dispatched',actionId,requiresBusinessVerification:true};
      } catch(error) {
        stopped=true;
        const failure=error instanceof ActionStoppedError ? error
          : new ActionStoppedError(dispatched?'dispatch_interrupted':'inspection_interrupted',dispatched?'unknown':'not_started');
        failure.action={actionId,purpose,outcome:failure.outcome,acknowledgedActions};
        failure.message+=`（动作 ${actionId}/${purpose}，本动作 ${failure.outcome}，此前已返回 ${acknowledgedActions} 个动作；不代表业务成功）`;
        if(failure.geometry)failure.message+=`；命中位置 ${JSON.stringify(failure.geometry)}`;
        throw failure;
      } finally {active=false;}
  };
  return Object.freeze({
    click:args=>perform(args,'click',async({target,dispatch})=>{
      for (const type of ['mouseMoved','mousePressed','mouseReleased']) {
        await dispatch('Input.dispatchMouseEvent',{
          type,x:target.x,y:target.y,
          ...(type !== 'mouseMoved' ? {button:'left',clickCount:1} : {}),
        });
      }
    }),
    hover:args=>perform(args,'hover',async({target,dispatch})=>{
      await dispatch('Input.dispatchMouseEvent',{type:'mouseMoved',x:target.x,y:target.y});
    }),
    escape:args=>perform({...args,selector:'body'},'page',async({dispatch})=>{
      for(const type of ['keyDown','keyUp'])await dispatch('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    }),
    scroll:async args=>{
      if(!['up','down'].includes(args.direction) || !Number.isFinite(args.pixels) || args.pixels<1 || args.pixels>1000)throw new Error('滚动方向和距离无效');
      return perform({...args,selector:'body'},'page',async({target,dispatch})=>{
        await dispatch('Input.dispatchMouseEvent',{type:'mouseWheel',x:target.x,y:target.y,deltaX:0,deltaY:args.pixels*(args.direction==='up'?-1:1)});
      });
    },
    scrollTo:args=>perform(args,'scroll',async({target,inspect,dispatch})=>{
      if(target.inViewport)return;
      const doc=await page.cdp('DOM.getDocument',{depth:0});
      if(!Number.isInteger(doc?.root?.nodeId))throw new ActionStoppedError('document_unavailable','not_started');
      const matches=await page.cdp('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector:args.selector});
      if(matches?.nodeIds?.length!==1)throw new ActionStoppedError('target_not_unique','not_started');
      await dispatch('DOM.scrollIntoViewIfNeeded',{nodeId:matches.nodeIds[0]});
      if(!(await inspect()).inViewport)throw new ActionStoppedError('scroll_unconfirmed','unknown');
    }),
    fill:async args=>{
      if(typeof args.value!=='string' || args.value.length>1000)throw new Error('输入值必须为不超过 1000 字的字符串');
      return perform(args,'fill',async({target,inspect,dispatch})=>{
        if(target.value===args.value)return;
        if(typeof target.value!=='string')throw new ActionStoppedError('missing_input_value','not_started');
        if(target.inputType==='number' && !/^(?:\d+(?:\.\d*)?|\.\d+)?$/.test(args.value))throw new ActionStoppedError('invalid_number','not_started');
        // Blink editing command selects only the already focused input. Read
        // back focus and selection before insertion; no JS value setter.
        await dispatch('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',commands:['selectAll']});
        await dispatch('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA'});
        const selected=await inspect();
        if(selected.value!==target.value)throw new ActionStoppedError('input_changed','unknown');
        if(target.inputType==='number') {
          // Number inputs do not expose selectionStart/End. Clear the focused
          // field once, then require an observed empty value before insertion.
          for(const type of ['keyDown','keyUp'])await dispatch('Input.dispatchKeyEvent',{type,key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
          if((await inspect()).value!=='')throw new ActionStoppedError('clear_unconfirmed','unknown');
        } else if(selected.selectionStart!==0 || selected.selectionEnd!==target.value.length) {
          throw new ActionStoppedError('selection_unconfirmed','unknown');
        }
        await dispatch('Input.insertText',{text:args.value});
        const after=await inspect();
        if(after.value!==args.value)throw new ActionStoppedError('input_unconfirmed','unknown');
      });
    },
  });
}
