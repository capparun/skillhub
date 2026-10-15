// Runs read-only in the browser; returns selectors and evidence, never mutates DOM.
export function inspect(request = {}) {
  // Verify the surface before reading candidate text or generating selectors.
  if(location.origin!=='https://h.liepin.com' || location.pathname!=='/search/getConditionItem'
      || (request.expectedUrl && !(request.expectedUrls ?? [request.expectedUrl]).includes(location.href))) {
    return {url:location.href,blocked:true,reason:'wrong_page',blank:false,login:false,risk:false};
  }
  const norm = value => (value ?? '').replace(/\s+/g, '').replace(/，/g, ',').trim();
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const reachable = el => {
    const rect=el.getBoundingClientRect();
    const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
    return !!hit && (hit===el || el.contains(hit));
  };
  const unambiguous = candidates => {
    if(candidates.length<=1)return candidates;
    const reachableCandidates=candidates.filter(reachable);
    return reachableCandidates.length===1?reachableCandidates:candidates;
  };
  const path = el => {
    if (!el) return null;
    if (el.id) {
      const selector = `#${CSS.escape(el.id)}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    const classes = [...el.classList].filter(name => /^[A-Za-z_][\w-]*$/.test(name));
    if (classes.length) {
      const selector = `${el.tagName.toLowerCase()}${classes.map(name => `.${CSS.escape(name)}`).join('')}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    let anchor = el.parentElement;
    while (anchor && anchor !== document.documentElement) {
      const anchorClasses = [...anchor.classList].filter(name => /^[A-Za-z_][\w-]*$/.test(name));
      if (anchorClasses.length) {
        const anchorSelector = `${anchor.tagName.toLowerCase()}${anchorClasses.map(name => `.${CSS.escape(name)}`).join('')}`;
        if (document.querySelectorAll(anchorSelector).length === 1) {
          const parts = [];
          let current = el;
          while (current && current !== anchor) {
            const tag = current.tagName.toLowerCase();
            const siblings = [...current.parentElement.children].filter(x => x.tagName === current.tagName);
            parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
            current = current.parentElement;
          }
          const selector = `${anchorSelector} > ${parts.join(' > ')}`;
          if (document.querySelectorAll(selector).length === 1) return selector;
        }
      }
      anchor = anchor.parentElement;
    }
    const parts = [];
    while (el && el !== document.documentElement) {
      const tag = el.tagName.toLowerCase();
      const siblings = [...el.parentElement.children].filter(x => x.tagName === el.tagName);
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(el) + 1})`);
      el = el.parentElement;
    }
    return `html > ${parts.join(' > ')}`;
  };
  const text = document.body?.innerText ?? '';
  const riskPatterns = ['验证码', '访问过于频繁', '操作频繁', '安全验证', '异常访问', '账号异常'];
  const riskSignals = riskPatterns.filter(pattern => text.includes(pattern));
  const hasSearchUi = !!document.querySelector('.search-btn, .search-item, .search-auto-complete-box');
  const base = {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    searchUi:hasSearchUi,
    timeOrigin: typeof performance!=='undefined' && Number.isFinite(performance.timeOrigin)?performance.timeOrigin:null,
    textLength: text.trim().length,
    risk: riskSignals.length > 0,
    riskSignals,
    login: /请登录|扫码登录/.test(text),
    blank: text.trim().length < 30 && !hasSearchUi,
    loading: !![...document.querySelectorAll('.ant-spin-spinning')].find(visible),
  };
  if (request.mode === 'selection-summary') {
    return {...base, observedAt:new Date().toISOString(), selected:[...document.querySelectorAll('.text-choose')]
      .filter(visible).map(el=>({title:el.closest('[title]')?.getAttribute('title')??null,text:norm(el.textContent)}))};
  }
  if (request.mode === 'results') {
    const cards = [...document.querySelectorAll('.detail-resume-card-wrap .tlog-common-resume-card')].filter(visible);
    // 分页控件:当前页码 + 可用的"下一页"按钮路径(禁用时不给路径,引擎据此停翻)。
    const activePage = document.querySelector('.ant-pagination-item-active');
    const nextBtn = [...document.querySelectorAll('.ant-pagination-next')]
      .find(el => visible(el) && !el.className.includes('ant-pagination-disabled'));
    const pageItems = [...document.querySelectorAll('.ant-pagination-item')].filter(visible);
    const lastPage = pageItems.length ? Number(norm(pageItems[pageItems.length - 1].textContent)) : NaN;
    const searchResponses = performance.getEntriesByType('resource').filter(entry => {
      try {const url=new URL(entry.name);return url.origin==='https://api-h.liepin.com' && url.pathname==='/api/com.liepin.searchfront4r.h.search-resumes';}
      catch {return false;}
    });
    const searchResponseEnd = searchResponses.reduce((latest,entry)=>Math.max(latest,entry.responseEnd||0),0);
    return { ...base, searchResponseEnd, loading: !![...document.querySelectorAll('.ant-spin-spinning')].find(visible), total: document.querySelector('.resume-num')?.textContent?.trim() ?? null,
      empty: /暂无符合条件|暂无数据|没有找到符合/.test(text), count: cards.length,
      pagination: {
        current: activePage ? Number(norm(activePage.textContent)) || null : null,
        next: nextBtn ? path(nextBtn) : null,
        totalPages: Number.isFinite(lastPage) ? lastPage : null,
      },
      rows: cards.slice(0, request.limit ?? 10).map(card => {
        const read = selector => card.querySelector(selector)?.textContent?.trim() || null;
        // 姓名节点可能混入"阅""名片简历"等徽标文本,只取节点自身的文本节点
        const nameEl = card.querySelector('.new-resume-personal-name');
        const ownText = nameEl ? [...nameEl.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
        return { detailLinks: [...card.querySelectorAll('a[href]')].filter(visible).map(a=>a.getAttribute('href')), detailTarget: nameEl && visible(nameEl) ? path(nameEl) : null, cardSelector: path(card), name: ownText || read('.new-resume-personal-name'), experience: read('.personal-detail-workyears'), education: read('.personal-detail-edulevel'), city: read('.personal-detail-dq'), expectation: read('.personal-expect-content'), skills: read('.new-resume-personal-skills'), status: read('.new-resume-status'), summary: card.innerText.trim() };
      }) };
  }
  if (request.mode === 'controls') {
    const leaves = [...document.querySelectorAll('span,a,button,div')]
      .filter(el => visible(el) && !el.children.length && norm(el.textContent));
    const resetMatches = [...document.querySelectorAll('span,a,button,div')].filter(el => visible(el) && ['清空筛选条件', '清空条件', '清空'].includes(norm(el.textContent)));
    const resetCandidates = unambiguous(resetMatches.filter(el=>!resetMatches.some(child=>child!==el && el.contains(child))));
    const submitCandidates = unambiguous([
      ...document.querySelectorAll('.search-btn, button'),
    ].filter(el => visible(el) && ['搜索', '搜人才', '找人才'].includes(norm(el.textContent))));
    const inputs = [...document.querySelectorAll('.search-item input, .search-top-bar input, .search-auto-complete-box input')]
      .filter(visible).filter(el=>!['checkbox','radio'].includes(el.type));
    const selectedNodes = [...document.querySelectorAll(
      '.search-item [class*="active"], .search-item [class*="checked"], .search-item [class*="selected"], .search-item [aria-selected="true"], .search-item [aria-checked="true"]',
    )].filter(visible);
    const nonemptyInputs = inputs.filter(el => norm(el.value));
    return {
      ...base,
      reset: path(resetCandidates.length === 1 ? resetCandidates[0] : null),
      submit: path(submitCandidates.length === 1 ? submitCandidates[0] : null),
      resetCount: resetCandidates.length,
      submitCount: submitCandidates.length,
      submitHtml: submitCandidates.length === 1 ? submitCandidates[0].outerHTML.slice(0, 600) : null,
      resetHtml: resetCandidates.length === 1 ? resetCandidates[0].outerHTML.slice(0, 600) : null,
      visibleActions: [...new Set(leaves.map(el => el.textContent.trim()).filter(Boolean))].slice(0, 40),
      inputHints: inputs.map(el => el.placeholder || el.getAttribute('aria-label') || el.name || el.id || el.type).slice(0, 30),
      selectedEvidence: selectedNodes.slice(0, 30).map(el => ({
        text: el.textContent?.trim() || null,
        className: String(el.className || ''),
        ariaSelected: el.getAttribute('aria-selected'),
        ariaChecked: el.getAttribute('aria-checked'),
      })),
      nonemptyInputs: nonemptyInputs.slice(0, 30).map(el => ({
        value: el.value,
        placeholder: el.placeholder || null,
        className: String(el.className || ''),
      })),
    };
  }
  if (!request.label) return base;
  const label = norm(request.label);
  const titledContainers = [...document.querySelectorAll('.search-item')].filter(el => {
    if (!visible(el)) return false;
    const title = norm(el.querySelector(':scope > .search-item-title')?.textContent).replace(/[：:]+$/, '');
    return title === label;
  });
  const containers = [...document.querySelectorAll('.search-item, .edu-tz, .search-top-bar, .search-item-cont, .ant-select')].filter(el => visible(el) && norm(el.textContent).includes(label)).sort((a,b) => a.textContent.length - b.textContent.length);
  let scoped = request.selector ? unambiguous([...document.querySelectorAll(request.selector)].filter(visible)) : [];
  // The observed sticky search bar duplicates the main keyword input. When
  // neither centre is reachable, retain the unique main input for scrolling.
  if(request.key==='keyword' && scoped.length>1){
    const main=scoped.filter(el=>!el.closest('.suck-input-box'));
    if(main.length===1)scoped=main;
  }
  // 部分控件(如跳槽频率)选中后行内不再显示字段名,按文本会丢失容器;
  // 首次定位后由调用方回传 rootPath 钉住同一容器。
  let pinnedRoot = null;
  if (request.rootPath) {
    const pinned = [...document.querySelectorAll(request.rootPath)].filter(visible);
    if (pinned.length === 1) pinnedRoot = pinned[0];
  }
  const root = pinnedRoot ?? (scoped.length === 1 ? (scoped[0].closest('.search-item') ?? scoped[0]) : (titledContainers.length === 1 ? titledContainers[0] : containers[0]));
  // 目标定位按控件类型区分:select 要可点击的 .ant-select-selector(其内部 input 是
  // opacity:0 只读框,点它坐标会落在同层回显 span 上);autocomplete/text 必须先取真实 input。
  let target = request.selector ? (scoped.length === 1 ? scoped[0] : null)
    : request.kind === 'select' ? root?.querySelector('.ant-select-selector') ?? root?.querySelector('input')
    : root?.querySelector('input') ?? root?.querySelector('.ant-select-selector');
  const checkboxInput = request.kind === 'check' ? target : null;
  // Some searchable Ant selectors keep their input readonly/transparent until
  // the outer selector is activated. Never fill or scroll that input first.
  const activationTarget = request.kind === 'autocomplete' && target &&
    (target.readOnly || getComputedStyle(target).opacity === '0')
    ? target.closest('.ant-select-selector') : null;
  if (checkboxInput) {
    const checkboxLabel = checkboxInput.closest('label');
    if (checkboxLabel && visible(checkboxLabel)) target = checkboxLabel;
  }
  const value = norm(request.value);
  // 城市级联选中后行内回显只显示城市名(弹层里是"省份·城市"),两种写法都要能命中
  const choiceValues = request.key === 'experience' && Array.isArray(request.choiceValues)
    ? request.choiceValues.map(norm)
    : request.cascade === 'city' && /[·・•]/.test(value)
    ? [value, value.split(/[·・•]/).pop()]
    : [value];
  const matching = root ? [...root.querySelectorAll('label, span, button, div')]
    .filter(el => visible(el) && choiceValues.includes(norm(el.textContent))) : [];
  // Only discard a parent when another eligible match can replace it. An em
  // containing the number alone must not discard its clickable year label.
  const exact = matching.filter(el => !matching.some(child => child !== el && el.contains(child)));
  const choice = exact.length === 1 ? exact[0] : null;
  const choiceState = choice?.closest('label, [class*="active"], [class*="checked"], [class*="selected"], [aria-selected], [aria-checked]');
  const linkedInput = choice?.closest('label')?.querySelector('input') || choice?.querySelector('input');
  const rect = choice?.getBoundingClientRect();
  const hit = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
  // self/descendant: CDP 点击能冒泡到 label;ancestor/other: 选项被折叠容器裁剪,
  // 点击只会落在外层容器上,必须先展开;none: 中心点在视口外,滚动后可恢复。
  const hitRelation = !choice ? null : !rect ? 'none' : !hit ? 'none'
    : hit === choice ? 'self' : choice.contains(hit) ? 'descendant' : hit.contains(choice) ? 'ancestor' : 'other';
  const selected = !!choice && (
    choiceState?.getAttribute('aria-selected') === 'true'
    || choiceState?.getAttribute('aria-checked') === 'true'
    || /active|checked|selected/i.test(choiceState?.className || '')
    || linkedInput?.checked === true
  );
  // 行业类选项的 textContent 是 主名+面包屑+命中关键词 的拼合,主名在 .industry-curent-level(站点原拼写)。
  const optionText = el => norm(el.querySelector('.industry-curent-level')?.textContent ?? el.textContent);
  const antOptions = [...document.querySelectorAll('.ant-select-dropdown .ant-select-item-option')].filter(el => visible(el) && (norm(el.textContent) === value || optionText(el) === value));
  // 职位类自定义联想(search-component):候选是 .suggest-list li,名称在 .list-title(含高亮分词)。
  const suggestOptions = [...document.querySelectorAll('.search-component-suggest .suggest-list li')]
    .filter(el => visible(el) && norm(el.querySelector('.list-title')?.textContent ?? '') === value);
  const options = [...antOptions, ...suggestOptions];
  // 联想项选中后回显的是职位类目名(data-info 里的 thirdJobName 等),不是输入的职位名;
  // 解码出来交给调用方,供验证时比对回显标签。
  const suggestMeta = suggestOptions.length === 1
    ? (() => { try { return JSON.parse(decodeURIComponent(suggestOptions[0].dataset.info || '')); } catch { return null; } })()
    : null;
  const pillTexts = root ? [...root.querySelectorAll('.search-component-items .ant-tag em')].filter(visible).map(el => norm(el.textContent)) : [];
  // 开关/输入控件同样可能被折叠区域裁剪(命中祖先容器而非控件本身)。
  const targetRect = target?.getBoundingClientRect();
  const targetHit = targetRect ? document.elementFromPoint(targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2) : null;
  const targetHitRelation = !target ? null : !targetRect ? 'none' : !targetHit ? 'none'
    : targetHit === target ? 'self' : target.contains(targetHit) ? 'descendant' : targetHit.contains(target) ? 'ancestor' : 'other';
  // 弹层诊断:记录可见下拉数量与候选文本,便于判断"点击未展开"还是"选项不匹配"。
  const dropdownCount = [...document.querySelectorAll('.ant-select-dropdown')].filter(visible).length;
  const dropdownOptions = [
    ...[...document.querySelectorAll('.ant-select-dropdown .ant-select-item-option')].filter(visible).map(el => optionText(el)),
    ...[...document.querySelectorAll('.search-component-suggest .suggest-list li')].filter(visible).map(el => norm(el.querySelector('.list-title')?.textContent ?? '')),
  ].filter(Boolean).slice(0, 20);
  const confirm = root ? [...root.querySelectorAll('button, span, div')].filter(el => visible(el) && norm(el.textContent) === '确定' && !el.children.length) : [];
  // 城市行的"其他"入口:行内只列热门城市,其余城市经 body 级弹层(搜索联想/按省钻取)选择
  const cascadeBtn = root ? [...root.querySelectorAll('.btn-choose')].find(el => visible(el) && norm(el.textContent) === '其他') : null;
  // 城市级联弹层(请选择城市):搜索框 + 联想候选 + 确认按钮;候选文本形如"广东·佛山",
  // 支持用户传城市名(后缀唯一匹配)或"省份·城市"(全等匹配)。
  const cityModalEl = [...document.querySelectorAll('.ant-modal.city-modal')].find(visible) ?? null;
  const citySuggestions = cityModalEl ? [...cityModalEl.querySelectorAll('.suggest-list li')].filter(visible) : [];
  // 用户可传城市名(后缀唯一匹配)或"省份·城市"(全等优先);统一间隔号写法
  const cityValue = value.replace(/[・•·]/g, '·');
  const cityTexts = citySuggestions.map(el => norm(el.textContent).replace(/[・•·]/g, '·'));
  const cityExact = citySuggestions.filter((_, i) => cityTexts[i] === cityValue);
  const citySuffix = citySuggestions.filter((_, i) => !!cityValue && cityTexts[i].endsWith(`·${cityValue}`));
  const cityMatched = cityExact.length ? cityExact : citySuffix;
  const cityConfirm = cityModalEl ? [...cityModalEl.querySelectorAll('.result-btn button')].filter(visible) : [];
  const expandLeaf = [...document.querySelectorAll('span,a,button,div')].find(el => visible(el) && !el.children.length && norm(el.textContent) === '展开更多条件');
  const expandTarget = expandLeaf?.parentElement ?? expandLeaf;
  return { ...base, target: path(target), activationTarget:path(activationTarget), inputReadOnly:!!target?.readOnly,
    choice: path(choice), selected, rootPath: path(root),
    choiceMatchCount: exact.length,
    choiceOptions: root ? [...root.querySelectorAll('label, span, button, div')]
      .filter(el => visible(el) && !el.children.length).map(el => norm(el.textContent))
      .filter(Boolean).filter((text,index,all)=>all.indexOf(text)===index).slice(0,30) : [],
    cascadeTrigger: path(cascadeBtn),
    cityModal: cityModalEl ? {
      input: path(cityModalEl.querySelector('.filter-box input.ant-input')),
      suggestionTexts: citySuggestions.map(el => norm(el.textContent)).slice(0, 10),
      match: cityMatched.length === 1 ? path(cityMatched[0]) : null,
      matchCount: cityMatched.length,
      confirm: cityConfirm.length === 1 ? path(cityConfirm[0]) : null,
      confirmDisabled: cityConfirm.length === 1 ? !!cityConfirm[0].disabled : null,
    } : null,
    choiceEvidence: choice ? {
      tag: choice.tagName,
      className: String(choice.className || ''),
      stateTag: choiceState?.tagName || null,
      stateClass: String(choiceState?.className || ''),
      ariaSelected: choiceState?.getAttribute('aria-selected') || null,
      ariaChecked: choiceState?.getAttribute('aria-checked') || null,
      inputChecked: linkedInput?.checked ?? null,
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      hitRelation,
      pointerEvents: choice ? getComputedStyle(choice).pointerEvents : null,
      hitTag: hit?.tagName || null,
      hitClass: String(hit?.className || ''),
      hitText: hit?.textContent?.trim().slice(0, 100) || null,
      html: choice.outerHTML.slice(0, 600),
      parentHtml: choice.parentElement?.outerHTML.slice(0, 1000) || null,
    } : null,
    rangeSummaries: request.kind === 'number' ? [...document.querySelectorAll('label[title]')]
      .filter(el => visible(el) && norm(el.getAttribute('title')) === norm(request.label))
      .map(el => norm(el.querySelector('.text-choose')?.textContent ?? el.textContent)) : [],
    option: options.length === 1 ? path(options[0]) : null, optionMeta: suggestMeta, pillTexts, confirm: confirm.length === 1 ? path(confirm[0]) : null,
    targetEvidence: target ? { hitRelation: targetHitRelation, hitTag: targetHit?.tagName || null, hitClass: String(targetHit?.className || '') } : null,
    dropdownCount, dropdownOptions,
    optionMatchCount: options.length,
    dropdownOptionsRaw: [...document.querySelectorAll('.ant-select-dropdown .ant-select-item-option')]
      .filter(visible).map(el => el.textContent).slice(0, 20),
    dropdownOptionsHtml: [...document.querySelectorAll('.ant-select-dropdown .ant-select-item-option')]
      .filter(visible).map(el => el.outerHTML.slice(0, 400)).slice(0, 5),
    // 自定义联想组件(如当前职位 search-component)的候选不在 ant-select-dropdown 里;
    // 全局找与请求值同文的可见叶子,给报错留出线索。
    suggestionEvidence: value ? [...document.querySelectorAll('span, div, li')]
      .filter(el => visible(el) && ![...el.children].length && norm(el.textContent) === value && !root?.contains(el))
      .slice(0, 5).map(el => ({ path: path(el), className: String(el.className || ''), parentHtml: el.parentElement?.outerHTML.slice(0, 300) || null })) : [],
    // 自定义组件的候选面板不一定叫 ant-select-dropdown;记录所有可疑弹层的类名与首段文本。
    popupEvidence: [...document.querySelectorAll('div, ul, section')]
      .filter(el => visible(el) && /drop|popup|panel|suggest|pop-over|float/i.test(String(el.className || '')) && norm(el.textContent))
      .slice(0, 6).map(el => ({ className: String(el.className || '').slice(0, 120), text: norm(el.textContent).slice(0, 80) })),
    suggestHtml: [...document.querySelectorAll('.search-component-suggest')].filter(visible)[0]?.outerHTML.slice(0, 1200) ?? null,
    value: target?.value ?? null, checked: checkboxInput?.checked ?? target?.checked ?? null,
    committed: !!root && [...root.querySelectorAll('.ant-select-selection-item')].some(el => {
      const text = norm(el.textContent);
      // 部分控件的选中回显带字段名前缀:跳槽频率(不限) → 跳槽频率(近5年不超过3段)
      return text === value || text === `${label}(${value})` || text === `${label}（${value}）`;
    }) || !!root && [...root.querySelectorAll('span, div')].filter(visible)
      // 联动自动补全(职位名称等)选中后以标签形式回显,不在 .ant-select-selection-item 里;
      // 隐藏镜像(aria-live)被 visible 过滤,下拉候选排除在外。
      .some(el => !el.children.length && norm(el.textContent) === value && !el.closest('.ant-select-dropdown, .ant-select-selector'))
      // 职位联想选中后的回显标签是类目名,与调用方回传的 expectedPills 比对。
      || pillTexts.includes(value) || (request.expectedPills ?? []).some(pill => pillTexts.includes(norm(pill))),
    // 选中区实际文本:验证失败时判断是"没选上"还是"显示文案与选项文案不一致"。
    selectionTexts: root ? [...root.querySelectorAll('.ant-select-selection-item')].filter(visible).map(el => norm(el.textContent)).slice(0, 10) : [],
    rootHtml: root ? root.outerHTML.slice(0, 800) : null,
    expand: path(expandTarget),
    expandEvidence: expandLeaf ? {
      leafHtml: expandLeaf.outerHTML.slice(0, 600),
      parentHtml: expandLeaf.parentElement?.outerHTML.slice(0, 1000) || null,
      grandparentHtml: expandLeaf.parentElement?.parentElement?.outerHTML.slice(0, 1400) || null,
    } : null };
}
