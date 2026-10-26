import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-si-url', access: 'read', description: 'test school/industry URL params via facet',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    // 先在 facet 面板选学校，看 URL 怎么变
    await page.goto('https://www.linkedin.com/search/results/people/?keywords=software+engineer', {
      waitUntil: 'domcontentloaded', timeout: 60000
    });
    await sleep(5000);
    console.log('初始 URL:', await page.evaluate('window.location.href'));

    // 打开 facet 面板
    console.log('打开面板...');
    await page.evaluate(`(function() {
      var all = Array.from(document.querySelectorAll('*'));
      for (var i=0;i<all.length;i++){
        var t=(all[i].textContent||'').trim().replace(/\\s+/g,' ');
        if(t==='全部筛选条件'||t==='All filters'){
          var el=all[i];
          for(var d=0;d<5;d++){
            if(!el) break;
            if(el.tagName.toLowerCase()==='button'||el.getAttribute('role')==='button') {
              el.click(); return;
            }
            el=el.parentElement;
          }
        }
      }
    })()`);
    await sleep(3000);

    // 滚动面板
    for(let i=0;i<6;i++){
      await page.evaluate(`(function(){
        var all=Array.from(document.querySelectorAll('*'));
        var panel=null, best=0;
        all.forEach(function(el){
          var r=el.getBoundingClientRect();
          var s=window.getComputedStyle(el);
          if(r.left>window.innerWidth*0.5&&r.height>200){
            var sc=r.height;
            if(s.position==='fixed'||s.position==='absolute') sc+=1000;
            if(el.scrollHeight>el.clientHeight) sc+=500;
            if(sc>best){best=sc;panel=el;}
          }
        });
        if(panel){panel.scrollBy(0,400);}
      })()`);
      await sleep(500);
    }
    await sleep(1000);

    // 点学校 checkbox — 用 MouseEvent 模拟
    const clickedSchool = await page.evaluate(`(function(){
      var all=Array.from(document.querySelectorAll('*'));
      for(var i=0;i<all.length;i++){
        var t=(all[i].textContent||'').trim();
        if(t==='Stanford University'||t==='斯坦福大学'){
          var cb=all[i].querySelector('input[type="checkbox"]');
          if(!cb&&all[i].parentElement) cb=all[i].parentElement.querySelector('input[type="checkbox"]');
          if(!cb){
            // 向上找
            var p=all[i].parentElement;
            for(var d=0;d<3&&p;d++){
              cb=p.querySelector('input[type="checkbox"]');
              if(cb) break;
              p=p.parentElement;
            }
          }
          if(cb){
            var r=cb.getBoundingClientRect();
            var x=r.left+r.width/2, y=r.top+r.height/2;
            cb.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,clientX:x,clientY:y}));
            cb.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,clientX:x,clientY:y}));
            cb.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y}));
            return 'clicked: '+t+' checked='+cb.checked;
          }
          return 'no checkbox for: '+t;
        }
      }
      return 'Stanford not found in panel';
    })()`);
    console.log('Stanford点击:', clickedSchool);
    await sleep(2000);

    // 点显示结果
    await page.evaluate(`(function(){
      var btns=Array.from(document.querySelectorAll('button,[role="button"]'));
      for(var i=0;i<btns.length;i++){
        var t=btns[i].textContent.trim();
        if(t==='显示结果'||t==='Show results'){btns[i].click();return;}
      }
    })()`);
    await sleep(5000);

    const schoolUrl = await page.evaluate('window.location.href');
    console.log('\n学校筛选后 URL:', schoolUrl);

    // 解析参数
    const parsed = new URL(schoolUrl);
    console.log('\n参数列表:');
    for(const [k,v] of parsed.searchParams){
      console.log(`  ${k}: ${decodeURIComponent(v)}`);
    }

    return {success:true};
  }
});
