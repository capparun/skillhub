import test from 'node:test';
import assert from 'node:assert/strict';
import {detailUrl, parseDetail, readDetail} from '../lib/detail.js';
const id = 'test_resume-123';
const snapshot = text => ({url:detailUrl(id), title:'简历', readyState:'complete', text});
test('retains complete visible text beyond legacy 3000 character truncation', () => {
  const text = `个人信息\n测试人选\n工作经历\n${'合成工程经验。'.repeat(1000)}\n教育经历\n测试大学\n项目经历\n测试项目`;
  const result = parseDetail(snapshot(text), id);
  assert.equal(result.status,'readable');
  assert.equal(result.text,text);
  assert.equal(result.truncated,false);
  assert.ok(result.sections.find(s=>s.heading==='工作经历').text.length>3000);
  assert.deepEqual(result.missingSections,[]);
});
test('risk wording inside real resume content is not a challenge page', () => {
  // 功能安全验证 is ordinary experience wording for servo/motion-control candidates.
  const text = '个人信息\n李**\n工作经历\n盛景智能科技（嘉兴）有限公司 电子工程师\n开展EMC设计和验证、功能安全验证（IEC 6180-5-2）等工作\n教育经历\n某大学 本科\n项目经历\n伺服驱动项目';
  const result = parseDetail(snapshot(text), id);
  assert.equal(result.status, 'readable');
  assert.notEqual(result.status, 'blocked');
});
test('does not call partial access complete and never returns blocked content', () => {
  assert.equal(parseDetail(snapshot('工作经历\n测试公司\n查看完整简历'),id).status,'partial');
  for (const [text,status] of [['请登录','login_required'],['安全验证','blocked'],['简历已删除','unavailable'],['页面菜单','unrecognized']]) {
    const result=parseDetail(snapshot(text),id); assert.equal(result.status,status); assert.equal(result.text,undefined);
  }
});
test('rejects a different candidate or host even when resume markers exist', () => {
  for (const url of [detailUrl('other'), 'https://example.com/resume/showresumedetail/?res_id_encode='+id]) {
    assert.equal(parseDetail({...snapshot('工作经历\n内容'),url},id).status,'wrong_page');
  }
});
test('invalid IDs never touch browser', async () => {
  for (const id of ['', '../secret', 'https://h.liepin.com/', 'x&y']) {
    await assert.rejects(readDetail({goto(){assert.fail('navigated');}},id));
  }
});
test('polls loading only, navigates once, stops immediately on risk', async () => {
  let navigations=0, reads=0;
  const page={goto:async()=>{navigations++;}, evaluate:async()=>{reads++;return snapshot(reads===1?'':'验证码');}};
  const result=await readDetail(page,id,{pause:async()=>{}});
  assert.equal(result.status,'blocked');assert.equal(navigations,1);assert.equal(reads,2);
});
test('observed counted headings and aliases are recognized using synthetic resume content', () => {
  const text='工作经历\n示例公司\n项目经历 （共 5 段）\n合成项目甲\n教育经历\n示例学校\n我的技能\n示例技能\n附加消息\n合成补充资料';
  const result=parseDetail(snapshot(text),id);
  assert.deepEqual(result.missingSections,[]);
  assert.equal(result.sections.find(s=>s.heading==='项目经历').text,'合成项目甲');
  assert.equal(result.sections.find(s=>s.heading==='技能特长').text,'示例技能');
  assert.equal(result.sections.find(s=>s.heading==='附加信息').text,'合成补充资料');
});
test('collapsed projects are partial until expanded; requesting attachments is a separate restriction', () => {
  const base='工作经历\n示例经历\n项目经历（共5段）\n合成项目甲\n合成项目乙\n';
  const collapsed=parseDetail(snapshot(base+'显示其他 3 段项目经历'),id);
  assert.equal(collapsed.status,'partial');
  assert.deepEqual(collapsed.limitations.collapsedSections,[{heading:'项目经历',remaining:3}]);
  const expanded=parseDetail(snapshot(base+'合成项目丙\n合成项目丁\n合成项目戊\n收起'),id);
  assert.equal(expanded.status,'readable');
  const restricted=parseDetail(snapshot(expanded.text+'\n*该段经历来自附件简历，索要简历后可查看完整内容'),id);
  assert.equal(restricted.status,'partial');assert.equal(restricted.limitations.attachmentRestricted,true);
});
test('ordinary attachment integration notes alone do not imply restricted content', () => {
  const result=parseDetail(snapshot('工作经历\n示例内容\n*该段内容已整合附件简历信息'),id);
  assert.equal(result.status,'readable');assert.equal(result.limitations.attachmentRestricted,false);
});
test('sidebar repeats and attachment/footer text do not become resume sections', () => {
  const text='工作经历\n合成职责\n项目经历（共1段）\n合成项目\n附加消息\n合成补充信息\n附件简历\nTA上传了附件简历，点击开聊向TA索要\n简历备注\n简历信息\n工作经历\n项目经历\n附加消息\n网站页脚';
  const result=parseDetail(snapshot(text),id);
  assert.equal(result.sections.length,3);
  assert.equal(result.sections.at(-1).text,'合成补充信息');
  assert.equal(result.text,text);assert.equal(result.status,'partial');
});
for(const boundary of ['本次搜索匹配到的简历不够精准？点击这里进行反馈','声明：该人选信息仅供公司招聘使用，严禁其他用途。'])test(`platform footer remains raw evidence, not language content: ${boundary.slice(0,4)}`,()=>{
 const text='工作经历\n合成工作\n语言能力\n普通话\n'+boundary+'\n简历不匹配\n工作经历\n导航文字';
 const result=parseDetail(snapshot(text),id),language=result.sections.find(s=>s.heading==='语言能力');
 assert.equal(language.text,'普通话');assert.equal(result.text,text);
 assert.equal(text.split('\n').slice(language.startLine-1,language.endLine).join('\n'),language.text);
});
test('resume prose mentioning feedback or a declaration is preserved',()=>{
 const text='工作经历\n为客户开发反馈模块\n语言能力\n普通话\n声明：本人可使用英语进行技术交流';
 assert.equal(parseDetail(snapshot(text),id).sections.at(-1).text,'普通话\n声明：本人可使用英语进行技术交流');
});
test('repeated nonempty resume headings retain every visible block and its source lines',()=>{
 const text='工作经历\n合成公司甲\n项目经历\n合成项目甲\n工作经历\n合成公司乙\n教育经历\n合成学校';
 const result=parseDetail(snapshot(text),id),work=result.sections.filter(s=>s.heading==='工作经历');
 assert.equal(work.length,2);assert.deepEqual(work.map(s=>s.text),['合成公司甲','合成公司乙']);
 for(const section of result.sections)assert.equal(text.split('\n').slice(section.startLine-1,section.endLine).join('\n'),section.text);
 assert.equal(result.text,text);
});
