import { cli, Strategy } from '@jackwener/opencli/registry';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
cli({
  site: 'hunter-linkedin', name: 'test-school-deep', access: 'read', description: 'deep scroll for school',
  domain: 'www.linkedin.com', strategy: Strategy.COOKIE, browser: true, args: [],
  func: async (page) => {
    await page.goto('https://www.linkedin.com/search/results/people/?keywords=software+engineer', {
      waitUntil: 'domcontentloaded', timeout: 60000
    });
    await sleep(5000);

    // 打开面板
    await page.evaluate(`(function(){
      var all=Array.from(document.querySelectorAll('*'));
      for(var i=0;i<all.length;i++){
        var t=(all[i].textContent||'').trim().replace(/\\s+/g,' ');
        if(t==='全部筛选条件'){
          var el=all[i];
          for(var d=0;d<5;d++){
            if(!el) break;
            if(el.tagName.toLowerCase()==='button'){el.click();return;}
            el=el.parentElement;
          }
        }
      }
    })()`);
    await sleep(3000);

    // 滚动面板到底
    for(let i=0;i<15;i++){
      const found = await page.evaluate(`(function(){
        var all=Array.from(document.querySelectorAll('*'));
        var panel=null, best=0;
        all.forEach(function(el){
          var r=el.getBoundingClientRect();
          if(r.left>window.innerWidth*0.5&&r.height>200){
            var s=window.getComputedStyle(el);
            var sc=r.height;
            if(s.position==='fixed'||s.position==='absolute') sc+=1000;
            if(el.scrollHeight>el.clientHeight) sc+=500;
            if(sc>best){best=sc;panel=el;}
          }
        });
        if(panel){
          var maxScroll=panel.scrollHeight-panel.clientHeight;
          panel.scrollBy(0, Math.min(600, maxScroll-panel.scrollTop));
          return panel.scrollTop+'/'+maxScroll;
        }
        return 'none';
      })()`);
      if(found==='none') break;
      await sleep(400);
    }

    // 搜索学校相关文本
    const schools = await page.evaluate(`(function(){
      var all=Array.from(document.querySelectorAll('*'));
      var found=[];
      for(var i=0;i<all.length;i++){
        var t=(all[i].textContent||'').trim();
        if(t==='Stanford University'||t==='哈佛大学'||t==='Harvard University'||
           t==='清华大学'||t==='Tsinghua University'||t.indexOf('学校')>=0||
           t.indexOf('School')>=0){
          var cb=all[i].querySelector('input[type="checkbox"]');
          found.push({text:t.substring(0,40), hasCheckbox:!!cb, tag:all[i].tagName});
          if(found.length>=10) break;
        }
      }
      return found;
    })()`);
    
    console.log('面板中学校相关:');
    schools.forEach(s => console.log(`  ${s.tag}: "${s.text}" checkbox:${s.hasCheckbox}`));

    return {success:true};
  }
});
