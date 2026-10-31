import test from 'node:test';
import assert from 'node:assert/strict';
import { plan } from '../lib/filters.js';
import { run } from '../lib/engine.js';
import { applySavedSearch, deleteSavedSearch, saveSearchPlan } from '../lib/records.js';
const url = 'https://h.liepin.com/search/getConditionItem';
test('validates all inputs before browser access', async () => {
  for (const args of [{}, { keyword: '' }, { keyword: 'a', limit: 31 }, { keyword: 'a', pages: 0 }, { keyword: 'a', pages: 11 }, { salaryMin: 20, salaryMax: 10 }, { overseas: 'false' }, { unknown: 'x' },
    { ageMin: -1 }, { ageMin: '25.5' }, { ageMin: 'abc' }, { ageMin: 40, ageMax: 25 }, { gender: '' }]) {
    await assert.rejects(run({ evaluate() { assert.fail('browser touched'); } }, args), { code: 'ARGUMENT' });
  }
});
test('age range accepts non-negative integers and keeps zero', () => {
  const steps = plan({ ageMin: 0, ageMax: 40 }).steps;
  assert.deepEqual(steps.map(s => [s.key, s.kind, s.selector, s.value]), [
    ['ageMin', 'age', '#ageLow', '0'],
    ['ageMax', 'age', '#ageHigh', '40'],
  ]);
});
test('saves a search plan once and verifies it from the visible scheme list', async () => {
  const states = [
    { saveButton: '#save', schemes: [] },
    { dialog: { input: '#name', confirm: '#confirm' }, schemes: [] },
    { schemes: [{ name: '深圳电机' }] },
  ];
  const actions = [];
  let focused=null;
  const page = {
    async evaluate() { return states.shift(); },
    async click(selector) { focused=selector;actions.push(['click', selector]); },
    async fillText(selector, value) { assert.equal(focused,selector,'native typing requires the name field to be focused');actions.push(['fill', selector, value]); },
  };
  await saveSearchPlan(page, '深圳电机', { requireFresh: false, pause: async () => {} });
  assert.deepEqual(actions, [['click', '#save'], ['click', '#name'], ['fill', '#name', '深圳电机'], ['click', '#confirm']]);
});
test('does not retry when saved search verification is uncertain', async () => {
  const states = [
    { saveButton: '#save', schemes: [] },
    { dialog: { input: '#name', confirm: '#confirm' }, schemes: [] },
    { schemes: [] },
  ];
  let confirms = 0;
  const page = {
    async evaluate() { return states.shift(); },
    async click(selector) { if (selector === '#confirm') confirms++; },
    async fillText() {},
  };
  await assert.rejects(saveSearchPlan(page, '深圳电机', { requireFresh: false, pause: async () => {} }), /不会自动重试/);
  assert.equal(confirms, 1);
});
test('applies one uniquely named saved search exactly once', async () => {
  const actions = [];
  const page = {
    async evaluate() { return { schemes: [{ name: '深圳电机', apply: '#apply' }] }; },
    async click(selector) { actions.push(selector); },
  };
  await applySavedSearch(page, '深圳电机', { requireFresh: false, pause: async () => {} });
  assert.deepEqual(actions, ['#apply']);
});
test('deletes one uniquely named saved search with one confirmation', async () => {
  const states = [
    { schemes: [{ name: '深圳电机', remove: '#remove' }] },
    { schemes: [{ name: '深圳电机' }], dialog: { text: '确定删除该搜索条件吗？', confirm: '#confirm' } },
    { schemes: [] },
  ];
  const actions = [];
  const page = {
    async evaluate() { return states.shift(); },
    async click(selector) { actions.push(selector); },
  };
  assert.deepEqual(await deleteSavedSearch(page, '深圳电机', { requireFresh: false, pause: async () => {} }), { name: '深圳电机', deleted: true });
  assert.deepEqual(actions, ['#remove', '#confirm']);
});
test('gender plans as a select filter without a hardcoded dynamic selector', () => {
  const [step] = plan({ gender: '男' }).steps;
  assert.deepEqual([step.label, step.kind, step.selector ?? null], ['性别', 'select', null]);
});
test('preserves numeric zero and explicit false', () => {
  assert.deepEqual(plan({ salaryMin: 0, overseas: false }).steps.map(s => s.value), ['0', 'false']);
});
test('accepts OpenCLI option provenance metadata but rejects other unknown keys', () => {
  assert.equal(plan({ keyword: '机械', __opencliOptionSources: { keyword: 'cli' } }).steps.length, 1);
  assert.throws(() => plan({ keyword: '机械', unknown: true }), /未知参数/);
});
function fake({ mismatch = false, risk = false, pending = false, blankReads = 0, reset = '#reset' } = {}) {
  const clicks = []; let value = ''; let reads = 0;
  return { clicks, async click(s) { clicks.push(s); }, async fillText(s,v) { value = v; }, async evaluate(fn, request) {
    const base = { url, risk, riskSignals: risk ? ['安全验证'] : [], blank: reads++ < blankReads, login: false };
    if (request.mode === 'controls') return { ...base, reset, submit: '#submit' };
    if (request.mode === 'results') return { ...base, count: pending ? 0 : 1, total: '3000+', rows: [{ name: '测试**' }] };
    return { ...base, target: '#keyword', value: mismatch ? '' : value };
  }};
}
test('one submission and separate page/total counts', async () => {
  const page = fake(); const result = await run(page, { keyword: '机械' }, { requireFresh: false, pause: async () => {} });
  assert.equal(page.clicks.filter(x => x === '#submit').length, 1);
  assert.equal(result.total, '3000+'); assert.equal(result.pageCount, 1); assert.equal(result.rows.length, 1);
});
test('prepare applies and verifies filters without submitting', async () => {
  const page = fake();
  const result = await run(page, { keyword: '机械' }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.deepEqual(result.applied, [{ field: 'keyword', value: '机械' }]);
  assert.equal(page.clicks.includes('#submit'), false);
});
test('waits through a short blank render before touching controls', async () => {
  const page = fake({ blankReads: 2 });
  await run(page, { keyword: '机械' }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.equal(page.clicks[0], '#reset');
});
test('does not require a reset control on a clean search page', async () => {
  const page = fake({ reset: null });
  await run(page, { keyword: '机械' }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.equal(page.clicks.includes('#reset'), false);
});
test('failed verification never submits', async () => {
  const broken = fake({ mismatch: true }); await assert.rejects(run(broken, { keyword: '机械' }, { requireFresh: false, pause: async () => {} }), { code: 'VERIFY' });
  assert.equal(broken.clicks.includes('#submit'), false);
});
test('a different or lookalike page never triggers implicit navigation or input',async()=>{
 for(const badUrl of ['https://h.liepin.com/search/getConditionItem-fake','https://h.liepin.com/login','https://h.liepin.com.evil.example/search/getConditionItem']) {
  await assert.rejects(run({evaluate:async()=>({url:badUrl}),goto:()=>assert.fail('must not navigate'),click:()=>assert.fail('must not click')},
    {keyword:'工程师'},{requireFresh:false,pause:async()=>{}}),{code:'PAGE'});
 }
});
test('a select with no dropdown evidence is not clicked a second time',async()=>{
 const clicks=[];const page={click:async selector=>clicks.push(selector),evaluate:async(fn,request)=>{
  const base={url,login:false,risk:false,blank:false};
  if(request.mode==='controls')return {...base,submit:'#submit'};
  return {...base,target:'#select',dropdownCount:0,option:null};
 }};
 await assert.rejects(run(page,{match:'任意关键词'},{requireFresh:false,pause:async()=>{}}),{code:'CONTROL'});
 assert.deepEqual(clicks,['#select']);
});
test('refreshes a choice selector after human-paced hover before clicking', async () => {
  let hovered = false; let selected = false;
  const page = {
    clicks: [],
    async hover(selector) { assert.equal(selector, '#before-hover'); hovered = true; },
    async click(selector) { this.clicks.push(selector); if (selector === '#after-hover') selected = true; },
    async evaluate(fn, request) {
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      return { ...base, choice: hovered ? '#after-hover' : '#before-hover', selected };
    },
  };
  const result = await run(page, { education: '本科' }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.deepEqual(result.applied, [{ field: 'education', value: '本科' }]);
  assert.deepEqual(page.clicks, ['#after-hover']);
});
test('expands the panel when the choice exists but is clipped by the collapsed area', async () => {
  let expanded = false; let selected = false;
  const page = {
    clicks: [],
    async hover() {},
    async click(selector) {
      this.clicks.push(selector);
      if (selector === '#expand') expanded = true;
      if (selector === '#lang') selected = true;
    },
    async evaluate(fn, request) {
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      return {
        ...base,
        choice: '#lang',
        selected,
        expand: expanded ? null : '#expand',
        choiceEvidence: { hitRelation: expanded ? 'self' : 'ancestor' },
      };
    },
  };
  const result = await run(page, { language: '英语' }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.equal(page.clicks[0], '#expand');
  assert.deepEqual(page.clicks, ['#expand', '#lang']);
  assert.deepEqual(result.applied, [{ field: 'language', value: '英语' }]);
});
test('closes a leftover dropdown with Escape before opening the next select', async () => {
  const keys = []; let escaped = false; const clicked = [];
  const page = {
    async pressKey(key) { keys.push(key); escaped = true; },
    async click(selector) { clicked.push(selector); },
    async evaluate(fn, request) {
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      return {
        ...base,
        target: '#activity',
        // Escape 前旧下拉仍可见;Escape 后收起,点击后展开并出现唯一候选
        dropdownCount: escaped ? (clicked.length ? 1 : 0) : 1,
        option: clicked.length ? '#opt' : null,
        dropdownOptions: clicked.length ? ['30天内活跃'] : [],
        committed: clicked.length >= 2,
      };
    },
  };
  const result = await run(page, { activity: '30天内活跃' }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.deepEqual(keys, ['Escape']);
  assert.deepEqual(result.applied, [{ field: 'activity', value: '30天内活跃' }]);
});
test('pins the container path from the first read for later verification reads', async () => {
  const requests = []; let clicked = false;
  const page = {
    async click(selector) { clicked = true; },
    async evaluate(fn, request) {
      requests.push({ ...request });
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      return {
        ...base,
        target: '#sel',
        rootPath: '#row-jobchanges',
        dropdownCount: clicked ? 1 : 0,
        option: clicked ? '#opt' : null,
        committed: clicked && requests.filter(r => r.rootPath).length >= 1,
      };
    },
  };
  const result = await run(page, { jobChanges: '近5年不超过3段' }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.deepEqual(result.applied, [{ field: 'jobChanges', value: '近5年不超过3段' }]);
  const stepReads = requests.filter(r => r.key === 'jobChanges');
  assert.equal(stepReads[0].rootPath, undefined);
  assert.ok(stepReads.slice(1).every(r => r.rootPath === '#row-jobchanges'));
});
test('expands the panel when a check control is clipped by the collapsed area', async () => {
  let expanded = false; let checked = false;
  const page = {
    clicks: [],
    async hover() {},
    async click(selector) {
      this.clicks.push(selector);
      if (selector === '#expand') expanded = true;
      if (selector === '#chk') checked = true;
    },
    async evaluate(fn, request) {
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      return {
        ...base,
        target: '#chk',
        checked,
        expand: expanded ? null : '#expand',
        targetEvidence: { hitRelation: expanded ? 'self' : 'ancestor' },
      };
    },
  };
  const result = await run(page, { overseas: true }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.deepEqual(page.clicks, ['#expand', '#chk']);
  assert.deepEqual(result.applied, [{ field: 'overseas', value: 'true' }]);
});
test('paginates across pages with per-row page numbers and one submission', async () => {
  let pageNo = 1;
  const page = {
    value: '',
    clicks: [],
    async click(selector) { this.clicks.push(selector); if (selector === '#next') pageNo = 2; },
    async fillText(selector, v) { this.value = v; },
    async evaluate(fn, request) {
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      if (request.mode === 'results') return {
        ...base, loading: false, count: 1, empty: false, total: '60',
        pagination: { current: pageNo, next: pageNo === 1 ? '#next' : null, totalPages: 2 },
        rows: [{ name: pageNo === 1 ? '甲**' : '乙**', experience: `工作${pageNo}年` }],
      };
      return { ...base, target: '#keyword', value: this.value };
    },
  };
  const checkpoints=[];
  const result = await run(page, { keyword: '前端', pages: 2, limit: 5 }, { requireFresh: false, pause: async () => {},onPage:async snapshot=>checkpoints.push(snapshot) });
  assert.deepEqual(checkpoints.map(p=>[p.currentPage,p.currentRows.length,p.rows.length]),[[1,1,1],[2,1,2]]);
  assert.equal(page.clicks.filter(x => x === '#submit').length, 1);
  assert.deepEqual(page.clicks.filter(x => x === '#next'), ['#next']);
  assert.equal(result.pages, 2);
  assert.deepEqual(result.rows.map(r => [r.name, r.page]), [['甲**', 1], ['乙**', 2]]);
});
test('stops pagination when the page does not advance and keeps what was read', async () => {
  const page = {
    value: '',
    clicks: [],
    async click(selector) { this.clicks.push(selector); },
    async fillText(selector, v) { this.value = v; },
    async evaluate(fn, request) {
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      if (request.mode === 'results') return {
        ...base, loading: false, count: 1, empty: false, total: '60',
        pagination: { current: 1, next: '#next', totalPages: 3 },
        rows: [{ name: '甲**', experience: '工作1年' }],
      };
      return { ...base, target: '#keyword', value: this.value };
    },
  };
  const result = await run(page, { keyword: '前端', pages: 3, limit: 5 }, { requireFresh: false, pause: async () => {} });
  assert.equal(result.pages, 1);
  assert.equal(result.rows.length, 1);
  assert.match(result.warning, /停止翻页/);
  assert.equal(page.clicks.filter(x => x === '#submit').length, 1);
});
test('risk stops before mutation; result timeout never resubmits', async () => {
  const blocked = fake({ risk: true }); await assert.rejects(run(blocked, { keyword: 'a' }), { code: 'RISK' }); assert.equal(blocked.clicks.length, 0);
  const slow = fake({ pending: true }); await assert.rejects(run(slow, { keyword: 'a' }, { requireFresh: false, pause: async () => {} }), { code: 'TIMEOUT' }); assert.equal(slow.clicks.filter(x => x === '#submit').length, 1);
});
test('city cascade: selects a non-hot city via the 其他 modal search and confirms', async () => {
  const clicks = [];
  let stage = 'row'; // row → modal → picked → done
  const page = {
    async click(selector) {
      clicks.push(selector);
      if (selector === '#other') stage = 'modal';
      if (selector === '#sugg') stage = 'picked';
      if (selector === '#confirm') stage = 'done';
    },
    async fillText() {},
    async evaluate(fn, request) {
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      if (stage === 'done') return { ...base, choice: '#foshan', selected: true, cascadeTrigger: '#other', cityModal: null };
      if (stage === 'row') return { ...base, choice: null, cascadeTrigger: '#other', cityModal: null };
      return {
        ...base, choice: null, cascadeTrigger: '#other',
        cityModal: {
          input: '#city-input', suggestionTexts: ['广东·佛山'],
          match: '#sugg', matchCount: 1,
          confirm: '#confirm', confirmDisabled: stage !== 'picked',
        },
      };
    },
  };
  const result = await run(page, { city: '佛山' }, { requireFresh: false, pause: async () => {}, submit: false });
  assert.deepEqual(clicks, ['#other', '#city-input', '#sugg', '#confirm']);
  assert.deepEqual(result.applied, [{ field: 'city', value: '佛山' }]);
  assert.equal(clicks.includes('#submit'), false);
});
test('city cascade refuses to guess when no unique suggestion matches', async () => {
  const clicks = [];
  const page = {
    async click(selector) { clicks.push(selector); },
    async fillText() {},
    async evaluate(fn, request) {
      const base = { url, risk: false, riskSignals: [], blank: false, login: false };
      if (request.mode === 'controls') return { ...base, reset: null, submit: '#submit' };
      if (clicks.includes('#other')) {
        return { ...base, choice: null, cascadeTrigger: '#other',
          cityModal: { input: '#city-input', suggestionTexts: ['辽宁·朝阳', '北京·朝阳区'], match: null, matchCount: 2, confirm: '#confirm', confirmDisabled: true } };
      }
      return { ...base, choice: null, cascadeTrigger: '#other', cityModal: null };
    },
  };
  await assert.rejects(run(page, { city: '朝阳' }, { requireFresh: false, pause: async () => {}, submit: false }), { code: 'CONTROL' });
  assert.equal(clicks.includes('#sugg'), false);
  assert.equal(clicks.includes('#submit'), false);
});

test('records submission intent before dispatch and never acknowledges a failed click', async () => {
  const page=fake(); const phases=[];
  const original=page.click;
  page.click=async selector=>{
    if(selector==='#submit') {
      assert.equal(phases.at(-1),'submitting');
      throw new Error('connection lost');
    }
    return original(selector);
  };
  await assert.rejects(run(page,{keyword:'机械'},{requireFresh:false,pause:async()=>{},onProgress:phase=>phases.push(phase)}),/connection lost/);
  assert.deepEqual(phases,['preparing_filters','submitting']);
});
test('saving conditions disables the default subscription and verifies it before submission',async()=>{
 for(const unchecked of [false,true]){
 const clicks=[];let checked=true,saved=false;
 const dialog=()=>({input:'#name',confirm:'#confirm',subscription:{selector:'#subscribe',checked}});
 const page={evaluate:async()=>({saveButton:'#save',schemes:saved?[{name:'测试'}]:[],dialog:dialog()}),click:async s=>{clicks.push(s);if(s==='#subscribe'&&unchecked)checked=false;if(s==='#confirm')saved=true;},fillText:async()=>{}};
 if(unchecked){await saveSearchPlan(page,'测试',{pause:async()=>{}});assert.equal(saved,true);}
 else {await assert.rejects(saveSearchPlan(page,'测试',{pause:async()=>{}}),/订阅/);assert.equal(saved,false);}
 assert.equal(clicks.filter(s=>s==='#subscribe').length,1);
 }
});
test('platform success dialog confirms saving without the obsolete inline scheme list',async()=>{
 const clicks=[];const states=[{saveButton:'#save',schemes:[]},{dialog:{input:'#name',confirm:'#confirm'},schemes:[]},{schemes:[],saveSuccess:true,acknowledge:'#ack'}];
 const result=await saveSearchPlan({evaluate:async()=>states.shift()??{schemes:[],saveSuccess:false},click:async s=>clicks.push(s),fillText:async()=>{}},'测试',{pause:async()=>{}});
 assert.equal(result.name,'测试');assert.equal(result.verification,'platform_success_dialog');assert.equal(result.listVerified,false);assert.equal(clicks.filter(s=>s==='#confirm').length,1);assert.equal(clicks.at(-1),'#ack');
});
test('save stops after one acknowledgment when the success modal does not close',async()=>{
 const clicks=[];let reads=0;
 const page={evaluate:async()=>{reads++;if(reads===1)return {saveButton:'#save',schemes:[]};if(reads===2)return {dialog:{input:'#name',confirm:'#confirm'},schemes:[]};return {schemes:[{name:'测试'}],saveSuccess:true,acknowledge:'#ack'};},click:async s=>clicks.push(s),fillText:async()=>{}};
 await assert.rejects(saveSearchPlan(page,'测试',{pause:async()=>{}}),/成功弹窗关闭未确认/);
 assert.equal(clicks.filter(s=>s==='#ack').length,1);assert.equal(clicks.filter(s=>s==='#confirm').length,1);
});

test('keyword suggestions are dismissed before the next autocomplete input',async()=>{
 let dropdown=false,value='',committed=false;const clicks=[],keys=[];
 const page={
  async pressKey(key){keys.push(key);dropdown=false},
  async click(selector){if(selector==='#title'&&dropdown)throw Error('covered by keyword suggestions');clicks.push(selector);if(selector==='#option'){committed=true;dropdown=false}},
  async fillText(selector,text){if(selector==='#keyword'){value=text;dropdown=true}},
  async evaluate(fn,request){const base={url,blank:false,login:false,risk:false};if(request.mode==='controls')return {...base,reset:null};if(!request.key)return base;
   if(request.key==='keyword')return {...base,target:'#keyword',value,dropdownCount:dropdown?1:0};
   return {...base,target:'#title',dropdownCount:dropdown?1:0,option:'#option',committed};}
 };
 const result=await run(page,{keyword:'嵌入式开发',title:'嵌入式开发'},{submit:false,pause:async()=>{}});
 assert.deepEqual(keys,['Escape']);assert.ok(clicks.includes('#title'));assert.equal(result.applied.length,2);
});

test('blurs an observed keyword popup on a safe label before the next input',async()=>{
 let popup=false,keyword='',committed=false;const clicks=[];
 const page={async pressKey(){assert.fail('Escape would reopen history')},async click(s){clicks.push(s);if(s==='#safe-label')popup=false;if(s==='#company'&&popup)throw Error('covered');if(s==='#option')committed=true},async fillText(s,v){if(s==='#keyword'){keyword=v;popup=true}},async evaluate(fn,q){const base={url,blank:false,login:false,risk:false};if(q.mode==='controls')return {...base,reset:null};if(!q.key)return base;if(q.key==='title')return {...base,value:''};if(q.key==='keyword')return {...base,target:'#keyword',value:keyword,dropdownCount:popup?1:0};return {...base,target:'#company',dropdownCount:popup?1:0,dropdownDismissTarget:'#safe-label',option:'#option',committed};}};
 const result=await run(page,{keyword:'工程师',company:'华为'},{submit:false,pause:async()=>{}});
 assert.ok(clicks.indexOf('#safe-label')<clicks.indexOf('#company'));assert.equal(result.applied.length,2);assert.equal(keyword,'工程师');
});
test('final combined readback rejects a later field changing an earlier keyword',async()=>{
 let value='',selected=false;
 const page={async click(s){if(s==='#education'){selected=true;value=''}},async fillText(s,v){value=v},async evaluate(fn,q){const base={url,blank:false,login:false,risk:false};if(q.mode==='controls')return {...base,reset:null};if(!q.key)return base;if(q.key==='keyword')return {...base,target:'#keyword',value};if(q.key==='education')return {...base,choice:'#education',selected,choiceEvidence:{hitRelation:'self'}};return {...base,value:''};}};
 await assert.rejects(run(page,{keyword:'工程师',education:'本科'},{submit:false,pause:async()=>{}}),/关键词 在后续条件设置后发生变化/);
});
test('saving keyword-only or uncommitted conditions explains the prerequisite without any click',async()=>{
 let clicks=0;
 await assert.rejects(saveSearchPlan({evaluate:async()=>({schemes:[],saveButton:null}),click:async()=>{clicks++;}},'测试',{pause:async()=>{}}),/已提交的非关键词筛选摘要/);
 assert.equal(clicks,0);
});
