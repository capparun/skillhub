import { cli, Strategy } from '@jackwener/opencli/registry';
import { execSync } from 'child_process';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

cli({
  site: 'hunter-linkedin',
  name: 'test-facet-ui-front',
  access: 'read',
  description: '前台状态下测试 facet UI 面板交互',
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
    await sleep(8000);

    console.log('激活 Chrome...');
    try {
      execSync('osascript -e \'tell application "Google Chrome" to activate\'', { timeout: 3000 });
    } catch(e) {}
    await sleep(3000);

    let tabState = await page.evaluate(`(function(){
      return { hidden: document.hidden, visibilityState: document.visibilityState };
    })()`);
    console.log(`标签页状态: hidden=${tabState.hidden}, visibilityState=${tabState.visibilityState}`);

    if(tabState.hidden){
      return { success: false, error: 'tab_not_foreground' };
    }

    // 记录点击前的所有可见 section/region 元素
    console.log('\n--- 点击前的区域结构 ---');
    const beforeRegions = await page.evaluate(`(function(){
      var regions = [];
      var allSections = Array.from(document.querySelectorAll('section, aside, [class*="filter"], [class*="facet"], [class*="panel"]'));
      allSections.forEach(function(el){
        if(el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetHeight > 100){
          regions.push({
            tag: el.tagName,
            class: el.className.substring(0,80),
            text: el.textContent.trim().substring(0,80),
            height: el.offsetHeight,
            width: el.offsetWidth
          });
        }
      });
      return regions.slice(0, 15);
    })()`);
    console.log('区域:', JSON.stringify(beforeRegions, null, 2));

    // 点击 Show filters
    console.log('\n--- 点击 Show filters ---');
    await page.evaluate(`(function(){
      var allBtns = Array.from(document.querySelectorAll('button'));
      var target = null;
      for(var i=0;i<allBtns.length;i++){
        var text = allBtns[i].textContent.trim().toLowerCase();
        if(text.indexOf('show')>=0 && text.indexOf('filter')>=0){
          target = allBtns[i];
          break;
        }
      }
      if(target){
        var rect = target.getBoundingClientRect();
        var x = rect.left + rect.width/2;
        var y = rect.top + rect.height/2;
        ['mousedown','focus','mouseup','click'].forEach(function(evtName){
          var evt = new MouseEvent(evtName, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window });
          target.dispatchEvent(evt);
        });
        target.click();
        return { clicked: true, text: target.textContent.trim() };
      }
      return { clicked: false };
    })()`);

    await sleep(6000);

    // 记录点击后的区域结构
    console.log('\n--- 点击后的区域结构 ---');
    const afterRegions = await page.evaluate(`(function(){
      var regions = [];
      var allSections = Array.from(document.querySelectorAll('section, aside, [class*="filter"], [class*="facet"], [class*="panel"]'));
      allSections.forEach(function(el){
        if(el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetHeight > 100){
          regions.push({
            tag: el.tagName,
            class: el.className.substring(0,80),
            text: el.textContent.trim().substring(0,80),
            height: el.offsetHeight,
            width: el.offsetWidth
          });
        }
      });
      return regions.slice(0, 15);
    })()`);
    console.log('区域:', JSON.stringify(afterRegions, null, 2));

    // 查找新出现的区域
    const beforeKeys = new Set(beforeRegions.map(r => r.class + r.tag));
    const newRegions = afterRegions.filter(r => !beforeKeys.has(r.class + r.tag));
    console.log('\n新出现的区域:', JSON.stringify(newRegions, null, 2));

    // 查找所有 button 和 input（点击后）
    console.log('\n--- 点击后的所有按钮 ---');
    const allBtns = await page.evaluate(`(function(){
      return Array.from(document.querySelectorAll('button')).map(function(b){
        return {
          text: b.textContent.trim().substring(0,40),
          class: b.className.substring(0,60),
          visible: b.offsetWidth > 0 && b.offsetHeight > 0
        };
      }).filter(function(b){ return b.visible && b.text.length > 0; }).slice(0, 20);
    })()`);
    console.log('按钮:', JSON.stringify(allBtns, null, 2));

    // 查找所有输入框（点击后）
    console.log('\n--- 点击后的所有输入框 ---');
    const allInputs = await page.evaluate(`(function(){
      return Array.from(document.querySelectorAll('input, textarea')).map(function(inp){
        return {
          tag: inp.tagName,
          type: inp.type || '',
          placeholder: inp.placeholder || '',
          id: inp.id || '',
          class: inp.className.substring(0,40),
          visible: inp.offsetWidth > 0 && inp.offsetHeight > 0
        };
      }).filter(function(i){ return i.visible; }).slice(0, 15);
    })()`);
    console.log('输入框:', JSON.stringify(allInputs, null, 2));

    // 如果找到了 job title 相关输入框，尝试输入
    const jobTitleInp = allInputs.find(i =>
      i.placeholder.toLowerCase().includes('job title') ||
      i.id.toLowerCase().includes('job-title')
    );

    if(jobTitleInp){
      console.log('\n--- 找到 Job Title 输入框，尝试输入 ---');
      console.log('输入框信息:', JSON.stringify(jobTitleInp));

      await page.evaluate(`(function(){
        var inputs = Array.from(document.querySelectorAll('input, textarea'));
        var target = null;
        for(var i=0;i<inputs.length;i++){
          var p = inputs[i].placeholder.toLowerCase();
          var id = inputs[i].id.toLowerCase();
          if(p.indexOf('job title')>=0 || id.indexOf('job-title')>=0){
            target = inputs[i];
            break;
          }
        }
        if(target){
          target.focus();
          target.value = 'Account Executive';
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
          target.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', bubbles: true }));
          return { inputted: true, id: target.id, placeholder: target.placeholder };
        }
        return { inputted: false };
      })()`);

      await sleep(4000);

      // 查找下拉选项
      const options = await page.evaluate(`(function(){
        return Array.from(document.querySelectorAll('[role="option"], .artdeco-typeahead__result, [class*="option"]')).map(function(o){
          return { text: o.textContent.trim().substring(0,60), class: o.className.substring(0,40) };
        }).slice(0, 10);
      })()`);
      console.log('下拉选项:', JSON.stringify(options, null, 2));

      // 点击 Account Executive 选项
      const aeOption = options.find(o => o.text === 'Account Executive');
      if(aeOption){
        console.log('\n--- 点击 Account Executive 选项 ---');
        await page.evaluate(`(function(){
          var options = Array.from(document.querySelectorAll('[role="option"], .artdeco-typeahead__result'));
          for(var i=0;i<options.length;i++){
            if(options[i].textContent.trim() === 'Account Executive'){
              options[i].click();
              return { clicked: true, text: options[i].textContent.trim() };
            }
          }
          return { clicked: false };
        })()`);
        await sleep(5000);
      }
    }

    // 查找 Apply/Show results 按钮
    console.log('\n--- 查找 Apply/Show results 按钮 ---');
    const actionBtns = await page.evaluate(`(function(){
      return Array.from(document.querySelectorAll('button')).map(function(b){
        return { text: b.textContent.trim().substring(0,40), class: b.className.substring(0,60), visible: b.offsetWidth>0&&b.offsetHeight>0 };
      }).filter(function(b){
        var t = b.text.toLowerCase();
        return b.visible && (t.indexOf('apply')>=0 || t.indexOf('show results')>=0 || t.indexOf('done')>=0 || t.indexOf('save')>=0);
      });
    })()`);
    console.log('操作按钮:', JSON.stringify(actionBtns, null, 2));

    // 最终状态
    console.log('\n--- 最终状态 ---');
    const finalState = await page.evaluate(`(function(){
      var totalEl = document.querySelector('.profile-list__header-info-text');
      return {
        url: window.location.href,
        totalText: totalEl ? totalEl.textContent.trim() : '',
        lockups: document.querySelectorAll('.artdeco-entity-lockup').length,
        pills: Array.from(document.querySelectorAll('[data-test-search-filter-pill]')).map(function(p){ return p.textContent.trim(); }).slice(0, 5)
      };
    })()`);
    console.log('最终状态:', JSON.stringify(finalState, null, 2));

    return { success: true };
  }
});
