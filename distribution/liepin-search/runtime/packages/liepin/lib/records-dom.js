export function inspectRecords(request = {}) {
  if(location.origin!=='https://h.liepin.com' || location.pathname!=='/search/getConditionItem'
      || (request.expectedUrl && !(request.expectedUrls ?? [request.expectedUrl]).includes(location.href))) {
    return {url:location.href,blocked:true,reason:'wrong_page',blank:false,login:false,risk:false};
  }
  const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const visible = el => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const path = el => {
    if (!el) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      let part = node.tagName.toLowerCase();
      if (node.classList.length) part += `.${[...node.classList].map(CSS.escape).join('.')}`;
      if (node.parentElement) {
        const peers = [...node.parentElement.children].filter(peer => peer.tagName === node.tagName);
        if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(node) + 1})`;
      }
      parts.unshift(part);
    }
    return `body > ${parts.join(' > ')}`;
  };
  const buttons = [...document.querySelectorAll('button')].filter(visible);
  const exactButton = text => buttons.filter(el => norm(el.textContent) === text);
  const dialogs = [...document.querySelectorAll('[role="dialog"], .ant-modal')].filter(visible);
  const dialog = dialogs.at(-1) ?? null;
  const roots = [...document.querySelectorAll('li.save')].filter(visible);
  const schemes = roots.map(el => ({
    name: norm(el.querySelector('.info')?.textContent),
    selector: path(el),
    apply: path(el.querySelector('.info')),
    remove: path(el.querySelector('.close')),
    subscribed: norm(el.querySelector('.status')?.textContent) === '退订',
    html: el.outerHTML.slice(0, 1200),
  })).filter(row => row.name);
  return {
    url: location.href,
    title: document.title,
    blank: !norm(document.body?.innerText),
    risk: /验证码|访问过于频繁|操作频繁|安全验证|异常访问|账号异常/.test(document.body?.innerText ?? ''),
    login: /登录|扫码登录/.test(norm(document.body?.innerText)) && !location.pathname.startsWith('/search/'),
    saveButton: exactButton('保存条件').length === 1 ? path(exactButton('保存条件')[0]) : null,
    saveButtonCount: exactButton('保存条件').length,
    saveSuccess: !!dialog && norm(dialog.textContent).includes('搜索条件保存成功'),
    acknowledge: dialog ? (()=>{const matches=[...dialog.querySelectorAll('button')].filter(visible).filter(el=>norm(el.textContent)==='知道了');return matches.length===1?path(matches[0]):null;})() : null,
    dialog: dialog ? {
      text: norm(dialog.textContent),
      inputValue: (()=>{const inputs=[...dialog.querySelectorAll('input')].filter(visible).filter(el=>['text','search'].includes(el.type));return inputs.length===1?inputs[0].value:null;})(),
      input: (() => {
        const inputs = [...dialog.querySelectorAll('input')].filter(visible).filter(el=>['text','search'].includes(el.type));
        return inputs.length === 1 ? path(inputs[0]) : null;
      })(),
      subscription: (()=>{
        const inputs=[...dialog.querySelectorAll('input[type="checkbox"]')].filter(visible);
        if(inputs.length!==1 || !norm(dialog.textContent).includes('订阅简历'))return null;
        const input=inputs[0];return {selector:path(input.closest('label')??input),checked:input.checked};
      })(),
      confirm: (() => {
        const matches = [...dialog.querySelectorAll('button')].filter(visible).filter(el => ['保存', '确定'].includes(norm(el.textContent).replace(/\s/g,'')));
        return matches.length === 1 ? path(matches[0]) : null;
      })(),
      cancel: (() => {
        const matches = [...dialog.querySelectorAll('button')].filter(visible).filter(el => ['取消', '关闭'].includes(norm(el.textContent).replace(/\s/g,'')));
        return matches.length === 1 ? path(matches[0]) : null;
      })(),
    } : null,
    schemes,
    requestedName: norm(request.name),
  };
}
