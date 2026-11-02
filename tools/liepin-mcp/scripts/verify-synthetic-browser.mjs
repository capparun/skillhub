// Explicitly tests the public upstream transport on self-created content only.
// No Liepin navigation, business tools, global configuration, or extension changes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {BrowserClient} from '../lib/client.mjs';
import {createPageFacade} from '../lib/transport.mjs';
const client=new BrowserClient(process.env.HUNTER_MCP_COMMAND??'opencli-mcp');
const owned=[];const evidence={kind:'synthetic-public-api',browserActions:[],checks:{},cleanup:[]};
let error;let server;
try{
 await client.start();
 const manifest=await client.js("await browser.chrome.call('runtime.getManifest',[])");
 evidence.extension={name:manifest.name,version:manifest.version};
 const html='<style>body{min-height:3000px}</style><script>document.addEventListener("keydown",event=>{if(event.key==="Escape")document.body.dataset.escaped="true"})</script><title>Hunter synthetic MCP acceptance</title><button id="open" onclick="const w=window.open(\'about:blank\');w.document.write(\'<title>Hunter synthetic child</title><h1>SYNTHETIC DETAIL</h1>\');w.document.close();">打开合成详情</button>';
 server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const parentId=String(await client.js(`(await browser.tabs.new(${JSON.stringify('http://127.0.0.1:'+server.address().port+'/synthetic')})).id`));
 const parent=client.claimOpenedTab(parentId);owned.push(parent);
 process.stderr.write('synthetic stage completed\n');evidence.browserActions.push('创建自有合成页');
 assert.equal(await parent.evaluate(()=>document.title),'Hunter synthetic MCP acceptance');
 const large=await parent.evaluate(()=>({text:document.title.repeat(6000)}));assert.equal(large.text,'Hunter synthetic MCP acceptance'.repeat(6000));evidence.checks.losslessLargeSnapshot=true;
 const click=await parent.act({action:'click',target:{selector:'#open'}});
 process.stderr.write('synthetic stage completed\n');evidence.browserActions.push('点击“打开合成详情”按钮一次');
 assert.equal(click.openedTabs?.length,1,'expected one child from single click');
 const childId=String(click.openedTabs[0].tab??click.openedTabs[0].tabId);
 assert.notEqual(childId,parentId);const child=client.claimOpenedTab(childId);owned.push(child);
 assert.equal(await child.evaluate(()=>document.querySelector('h1')?.textContent),'SYNTHETIC DETAIL');
 process.stderr.write('synthetic stage completed\n');evidence.browserActions.push('读取新合成详情页标题');evidence.checks.childIdentityAndRead=true;
 await child.close();owned.splice(owned.indexOf(child),1);evidence.cleanup.push({tabId:childId,closed:true});
 await parent.activate();assert.equal(await parent.evaluate(()=>document.title),'Hunter synthetic MCP acceptance');
 process.stderr.write('synthetic stage completed\n');evidence.browserActions.push('关闭合成详情，切回并核对合成首页');evidence.checks.returnToParent=true;
 const facade=createPageFacade(parent,{onAction:event=>evidence.browserActions.push(event)});
 await facade.scroll('down',320);
 assert.ok(await parent.evaluate(()=>window.scrollY)>0,'page must visibly scroll');evidence.checks.scroll=true;
 await facade.action('press','body','Escape','Escape（收起合成控件）');
 assert.equal(await parent.evaluate(()=>document.body.dataset.escaped),'true');evidence.checks.escape=true;
}catch(e){error=e;evidence.error=e.message;}
finally{
 for(const tab of owned.reverse()){try{await tab.close();evidence.cleanup.push({tabId:tab.id,closed:true});}catch(e){evidence.cleanup.push({tabId:tab.id,closed:false,error:e.message});error??=e;}}
 try{evidence.sessionCleanup=await client.js('await browser.tabs.finalize({keep:[]})');if(evidence.sessionCleanup.failed?.length)throw Error('session cleanup incomplete');}catch(e){error??=e;evidence.cleanupError=e.message;}
 client.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}evidence.ok=!error;console.log(JSON.stringify(evidence,null,2));if(error)process.exitCode=1;
}
