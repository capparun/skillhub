import { cli, Strategy } from '@jackwener/opencli/registry';
import { execSync } from 'child_process';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-facet-diagnose',
  access: 'read',
  description: '诊断 facet UI 交互卡点',
  domain: 'www.linkedin.com',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [],
  func: async (page) => {
    console.log('导航到搜索页...');
    await page.goto('https://www.linkedin.com/talent/search?searchBoolean=engineer&start=0', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await sleep(10000);

    console.log('激活 Chrome...');
    try {
      execSync('osascript -e \'tell application "Google Chrome" to activate\'', { timeout: 3000 });
    } catch(e) {}
    await sleep(3000);

    // ========== 1. 详细检查 Show filters 按钮 ==========
    console.log('\n--- 1. Show filters 按钮详情 ---');
    const btnDetail = await page.evaluate(`(function(){
      var allBtns = Array.from(document.querySelectorAll('button'));
      var target = null;
      for(var i=0;i<allBtns.length;i++){
        var text = allBtns[i].textContent.trim().toLowerCase();
        if(text.indexOf('show')>=0 && text.indexOf('filter')>=0){
          target = allBtns[i];
          break;
        }
      }
      if(!target) return { found: false };

      var rect = target.getBoundingClientRect();
      var parent = target.parentElement;
      var grandparent = parent ? parent.parentElement : null;

      // 检查所有事件监听器（通过遍历 DOM 属性）
      var eventProps = [];
      for(var key in target){
        if(key.indexOf('on') === 0 && target[key]){
          eventProps.push(key);
        }
      }

      // 检查 Ember 相关属性
      var emberProps = [];
      for(var key in target){
        if(key.indexOf('ember')>=0 || key.indexOf('__ember')>=0){
          emberProps.push(key);
        }
      }

      // 检查 data-* 属性
      var dataAttrs = {};
      Array.from(target.attributes).forEach(function(attr){
        if(attr.name.indexOf('data-')===0){
          dataAttrs[attr.name] = attr.value.substring(0,50);
        }
      });

      return {
        found: true,
        tag: target.tagName,
        text: target.textContent.trim(),
        disabled: target.disabled,
        ariaDisabled: target.getAttribute('aria-disabled'),
        class: target.className,
        id: target.id || '',
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        parentTag: parent ? parent.tagName : '',
        parentClass: parent ? parent.className.substring(0,80) : '',
        grandparentTag: grandparent ? grandparent.tagName : '',
        grandparentClass: grandparent ? grandparent.className.substring(0,80) : '',
        eventProps: eventProps,
        emberProps: emberProps.slice(0, 10),
        dataAttrs: dataAttrs,
        // 检查是否有子元素（如 span, svg）
        childTags: Array.from(target.children).map(function(c){ return c.tagName; }),
        // 检查 computed style
        pointerEvents: getComputedStyle(target).pointerEvents,
        display: getComputedStyle(target).display,
        visibility: getComputedStyle(target).visibility,
        opacity: getComputedStyle(target).opacity,
        zIndex: getComputedStyle(target).zIndex
      };
    })()`);
    console.log(JSON.stringify(btnDetail, null, 2));

    if(!btnDetail.found){
      console.log('未找到 Show filters 按钮');
      return { success: false };
    }

    // ========== 2. 尝试多种点击方式 ==========
    console.log('\n--- 2. 尝试多种点击方式 ---');

    // 方式A: 标准 click()
    console.log('\n方式A: 标准 click()');
    await page.evaluate(`(function(){
      var btn = document.querySelector('button.artdeco-button--tertiary');
      var allBtns = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<allBtns.length;i++){
        if(allBtns[i].textContent.trim().toLowerCase().indexOf('show filters')>=0){
          btn = allBtns[i];
          break;
        }
      }
      if(btn) btn.click();
      return 'clicked';
    })()`);
    await sleep(3000);
    var afterA = await page.evaluate(`(function(){
      return { url: window.location.href, hasPanel: !!document.querySelector('.search-filters-panel') };
    })()`);
    console.log('  结果:', JSON.stringify(afterA));

    // 方式B: mousedown + mouseup + click 序列
    console.log('\n方式B: mousedown + mouseup + click');
    await page.evaluate(`(function(){
      var btn = null;
      var allBtns = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<allBtns.length;i++){
        if(allBtns[i].textContent.trim().toLowerCase().indexOf('show filters')>=0){
          btn = allBtns[i];
          break;
        }
      }
      if(btn){
        var rect = btn.getBoundingClientRect();
        var x = rect.left + rect.width/2;
        var y = rect.top + rect.height/2;
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      }
      return 'done';
    })()`);
    await sleep(3000);
    var afterB = await page.evaluate(`(function(){
      return { url: window.location.href, hasPanel: !!document.querySelector('.search-filters-panel') };
    })()`);
    console.log('  结果:', JSON.stringify(afterB));

    // 方式C: focus + Enter 键
    console.log('\n方式C: focus + Enter');
    await page.evaluate(`(function(){
      var btn = null;
      var allBtns = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<allBtns.length;i++){
        if(allBtns[i].textContent.trim().toLowerCase().indexOf('show filters')>=0){
          btn = allBtns[i];
          break;
        }
      }
      if(btn){
        btn.focus();
        btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        btn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      }
      return 'done';
    })()`);
    await sleep(3000);
    var afterC = await page.evaluate(`(function(){
      return { url: window.location.href, hasPanel: !!document.querySelector('.search-filters-panel') };
    })()`);
    console.log('  结果:', JSON.stringify(afterC));

    // 方式D: 点击父元素
    console.log('\n方式D: 点击父元素');
    await page.evaluate(`(function(){
      var btn = null;
      var allBtns = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<allBtns.length;i++){
        if(allBtns[i].textContent.trim().toLowerCase().indexOf('show filters')>=0){
          btn = allBtns[i];
          break;
        }
      }
      if(btn && btn.parentElement){
        btn.parentElement.click();
      }
      return 'done';
    })()`);
    await sleep(3000);
    var afterD = await page.evaluate(`(function(){
      return { url: window.location.href, hasPanel: !!document.querySelector('.search-filters-panel') };
    })()`);
    console.log('  结果:', JSON.stringify(afterD));

    // 方式E: 通过 document.elementFromPoint 获取最上层元素并点击
    console.log('\n方式E: elementFromPoint 点击');
    await page.evaluate(`(function(){
      var btn = null;
      var allBtns = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<allBtns.length;i++){
        if(allBtns[i].textContent.trim().toLowerCase().indexOf('show filters')>=0){
          btn = allBtns[i];
          break;
        }
      }
      if(btn){
        var rect = btn.getBoundingClientRect();
        var x = rect.left + rect.width/2;
        var y = rect.top + rect.height/2;
        var topEl = document.elementFromPoint(x, y);
        if(topEl){
          topEl.click();
          return { clicked: topEl.tagName, text: topEl.textContent.trim().substring(0,30) };
        }
      }
      return { clicked: false };
    })()`);
    await sleep(3000);
    var afterE = await page.evaluate(`(function(){
      return { url: window.location.href, hasPanel: !!document.querySelector('.search-filters-panel') };
    })()`);
    console.log('  结果:', JSON.stringify(afterE));

    // ========== 3. 检查是否有 JS 错误 ==========
    console.log('\n--- 3. 检查页面错误 ---');
    const errors = await page.evaluate(`(function(){
      // 检查全局错误
      return {
        hasEmber: typeof Ember !== 'undefined',
        emberVersion: typeof Ember !== 'undefined' ? Ember.VERSION : 'N/A',
        hasJQuery: typeof jQuery !== 'undefined',
        // 检查是否有报错提示元素
        errorEls: Array.from(document.querySelectorAll('[class*="error"], [class*="toast"]')).map(function(e){
          return e.textContent.trim().substring(0,50);
        }).slice(0, 3)
      };
    })()`);
    console.log('页面状态:', JSON.stringify(errors, null, 2));

    // ========== 4. 检查 Ember action 属性 ==========
    console.log('\n--- 4. 检查按钮上的 Ember action ---');
    const emberAction = await page.evaluate(`(function(){
      var btn = null;
      var allBtns = Array.from(document.querySelectorAll('button'));
      for(var i=0;i<allBtns.length;i++){
        if(allBtns[i].textContent.trim().toLowerCase().indexOf('show filters')>=0){
          btn = allBtns[i];
          break;
        }
      }
      if(!btn) return { found: false };

      // Ember 通常会把 action ID 放在 data-ember-action 属性上
      var actionId = btn.getAttribute('data-ember-action');

      // 检查是否有 EventTarget.prototype.addEventListener 的替代
      return {
        found: true,
        dataEmberAction: actionId || 'none',
        // 检查所有 data-* 属性
        allData: Array.from(btn.attributes).filter(function(a){
          return a.name.indexOf('data-')===0;
        }).map(function(a){ return a.name + '=' + a.value.substring(0,30); })
      };
    })()`);
    console.log('Ember action:', JSON.stringify(emberAction, null, 2));

    // ========== 5. 尝试直接触发 Ember action ==========
    if(emberAction.found && emberAction.dataEmberAction !== 'none'){
      console.log('\n--- 5. 尝试触发 Ember action ---');
      await page.evaluate(`(function(){
        var btn = null;
        var allBtns = Array.from(document.querySelectorAll('button'));
        for(var i=0;i<allBtns.length;i++){
          if(allBtns[i].textContent.trim().toLowerCase().indexOf('show filters')>=0){
            btn = allBtns[i];
            break;
          }
        }
        if(btn){
          var actionId = btn.getAttribute('data-ember-action');
          if(actionId && typeof Ember !== 'undefined'){
            // 尝试通过 Ember 的事件系统触发
            var view = Ember.View ? Ember.View.views[actionId] : null;
            if(view && view.send){
              view.send('click');
              return { method: 'ember_view_send' };
            }
          }
        }
        return { method: 'failed' };
      })()`);
      await sleep(3000);
      var afterEmber = await page.evaluate(`(function(){
        return { url: window.location.href, hasPanel: !!document.querySelector('.search-filters-panel') };
      })()`);
      console.log('  结果:', JSON.stringify(afterEmber));
    }

    return { success: true };
  }
});
