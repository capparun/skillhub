import test from 'node:test';import assert from 'node:assert/strict';import { isLiepinMcpRelease, liepinMcpGuide, liepinMcpUsagePrompt } from '../src/lib/liepin-guide';
test('Liepin release selects the shipped transport including prerelease versions',()=>{
 for(const v of ['0.3.0','0.3.0-alpha.1','1.0.0','0.3.1+build.1'])assert.equal(isLiepinMcpRelease(v),true);
 for(const v of [undefined,'bad','0.1.0','0.2.3','0.3'])assert.equal(isLiepinMcpRelease(v),false);
});
for(const platform of ['mac','windows'] as const)test(`MCP installation guidance keeps local, browser and business stages separate: ${platform}`,()=>{
 const guide=liepinMcpGuide({platform,version:'0.3.0',sha256:'a'.repeat(64),command:'INSTALL_COMMAND',keyword:'嵌入式开发',city:'深圳'});
 assert.match(guide.install,/INSTALL_COMMAND/);assert.match(guide.install,/local-installed-browser-setup-required/);assert.match(guide.connect,/tabs.*bind/);assert.match(guide.search,/搜索前询问.*分组/);
 assert.doesNotMatch(Object.values(guide).join('\n'),/opencli liepin|1\.8\.8|hunter-liepin-search|npm install -g/);
 assert.match(guide.install,platform==='windows'?/Windows PowerShell/:/macOS/);
});
test('MCP usage prompts retain group choice and save prerequisite',()=>{
 assert.match(liepinMcpUsagePrompt('connect','old'),/hunter-liepin-mcp/);assert.match(liepinMcpUsagePrompt('search','搜索'),/搜索前集中询问/);assert.match(liepinMcpUsagePrompt('favorites','收藏'),/不默认未分组/);assert.match(liepinMcpUsagePrompt('saved','保存'),/非关键词/);
});

test("formal sourcing is distinct from the five-row installation smoke check", () => {
 const formal = liepinMcpUsagePrompt("search", "old");
 assert.match(formal, /当前完整页（最多30条）/);
 assert.match(formal, /筛选条/);
 assert.match(formal, /独立核实归属/);
 assert.doesNotMatch(formal, /先读取首页最多5人/);
});
