import { cli, Strategy } from './lib/register.js';
import { inspect } from './lib/dom.js';

cli({
  site: 'liepin',
  access: 'read',
  name: 'diagnose',
  description: '只读检查当前猎聘搜索页状态和可见控件，不导航、不点击',
  domain: 'h.liepin.com',
  navigateBefore: 'https://h.liepin.com/search/getConditionItem',
  strategy: Strategy.UI,
  browser: true,
  siteSession: 'persistent',
  args: [
    { name: 'probe', type: 'string', help: '只读探查指定字段标题(如 跳槽频率)的容器结构,不点击' },
    { name: 'probeValue', type: 'string', help: '配合 probe 的候选值,用于选项匹配证据' },
  ],
  columns: ['url', 'title', 'readyState', 'textLength', 'riskSignals', 'resetCount', 'submitCount', 'submitHtml', 'visibleActions', 'inputHints', 'selectedEvidence', 'nonemptyInputs', 'choiceProbes', 'probeResult'],
  func: async (page, args) => {
    let state = await page.evaluate(inspect, { mode: 'controls' });
    if (!state.url.startsWith('https://h.liepin.com/search/getConditionItem')) {
      await page.goto('https://h.liepin.com/search/getConditionItem');
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        state = await page.evaluate(inspect, { mode: 'controls' });
        if (!state.blank) break;
      }
    }
    const choiceProbes = await Promise.all([
      page.evaluate(inspect, { key: 'city', label: '目前城市', kind: 'choice', value: '深圳' }),
      page.evaluate(inspect, { key: 'education', label: '教育经历', kind: 'choice', value: '本科' }),
      page.evaluate(inspect, { key: 'language', label: '语言', kind: 'choice', value: '英语' }),
    ]);
    const probeResult = args.probe
      ? await page.evaluate(inspect, { label: args.probe, value: args.probeValue ?? '' })
      : null;
    return [{
      url: state.url,
      title: state.title,
      readyState: state.readyState,
      textLength: state.textLength,
      riskSignals: state.riskSignals?.join('、') || null,
      resetCount: state.resetCount,
      submitCount: state.submitCount,
      submitHtml: state.submitHtml,
      visibleActions: state.visibleActions?.join(' | ') || null,
      inputHints: state.inputHints?.join(' | ') || null,
      selectedEvidence: state.selectedEvidence ?? [],
      nonemptyInputs: state.nonemptyInputs ?? [],
      choiceProbes: choiceProbes.map(({ choice, selected, choiceEvidence, expand, expandEvidence }) => ({ choice, selected, choiceEvidence, expand, expandEvidence })),
      probeResult,
    }];
  },
});
