import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cli, getRegistry } from '@jackwener/opencli/registry';

// LinkedIn's 2026 UI scrolls main#workspace, not window. Keep this in our
// pinned runtime so reinstalling OpenCLI does not erase the compatibility fix.
export function scrollContent() {
  const main = document.querySelector('main#workspace');
  const scroller = main && /auto|scroll/.test(getComputedStyle(main).overflowY)
    ? main : document.scrollingElement;
  if (scroller) scroller.scrollTop += Math.max(500, scroller.clientHeight * 0.85);
}

export async function loadVisibleContent(page, times = 8) {
  for (let i = 0; i < Math.min(10, times); i++) {
    await page.evaluate(scrollContent);
    await page.wait(0.7);
  }
}

export function readProfilePage() {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const main = document.querySelector('main [aria-label="Primary content"]') || document.querySelector('main');
  if (!main) return null;
  const headings = [...main.querySelectorAll('h1,h2')];
  const container = heading => {
    let result = heading;
    for (let node = heading?.parentElement; node && node !== main; node = node.parentElement) {
      if (node.querySelectorAll('h1,h2').length !== 1) break;
      result = node;
    }
    return result;
  };
  const section = pattern => {
    const heading = headings.find(h => pattern.test(clean(h.innerText)));
    if (!heading) return '';
    const text = container(heading)?.innerText || '';
    return text.split(/\n+/).map(clean).filter(line => line && line !== clean(heading.innerText)
      && !/^(Show all|See more|Show less|显示全部|展开)/i.test(line)).join('\n');
  };
  const first = headings[0];
  const intro = container(first);
  const name = clean(first?.innerText);
  const contact = intro?.querySelector('a[href*="/overlay/contact-info/"]');
  const contactRow = contact?.parentElement?.parentElement;
  const location = [...(contactRow?.querySelectorAll('p,span') || [])]
    .filter(e => !e.contains(contact)).map(e => clean(e.innerText)).find(t => t && t !== '·' && t !== '•') || '';
  const lines = (intro?.innerText || '').split(/\n+/).map(clean).filter(Boolean);
  const headline = lines.find(line => line !== name && line !== location && !/^[·•]|^(1st|2nd|3rd|Contact info|Message|Follow|Connect|More|Open to|Add section|View .*verifications)$/i.test(line)) || '';
  const metrics = section(/^Analytics$|^分析$/i);
  return {
    profile_url: locationHref(), name, headline, location,
    about:section(/^About$|^关于$/i), experience:section(/^Experience$|^工作经历$/i),
    education:section(/^Education$|^教育经历$/i), services:section(/^Services$|^Providing services$|^服务$/i),
    featured:section(/^Featured$|^精选$/i), about_character_count:'', about_skills:'',
    raw_analytics: metrics + '\n' + lines.filter(l => /\b(connections?|followers?)\b/i.test(l)).join('\n') + '\n' + section(/^Activity$|^动态$/i).split('\n').filter(l => /followers?/i.test(l)).join('\n'),
  };
  function locationHref() { return window.location.href; }
}

// Read-only extraction: do not click generic "More" controls (which may be menus).
export function readPostCards() {
  const clean = value => String(value || '').replace(/\s+/g,' ').trim();
  const main = document.querySelector('main [aria-label="Primary content"]') || document.querySelector('main');
  if (!main) return [];
  return [...main.querySelectorAll('[role="listitem"][componentkey^="update-card-focus"], article, [role="article"], .feed-shared-update-v2, .occludable-update')].map(card => {
    const raw = card.innerText || '';
    const bodyNode = card.querySelector('[data-testid="expandable-text-box"], .update-components-text, .feed-shared-update-v2__description, .feed-shared-text');
    const body = clean(bodyNode?.innerText).replace(/(?:…|\.\.\.)\s*more$/i,'');
    const links = [...card.querySelectorAll('a[href]')];
    const permalink = links.find(a=>/\/(feed\/update|posts|pulse)\//.test(a.href));
    const analytics = links.find(a=>a.href.includes('/analytics/post-summary/urn:li:activity:'));
    const activity = analytics?.href.match(/urn:li:activity:(\d+)/)?.[0];
    const url = permalink?.href || (activity ? 'https://www.linkedin.com/feed/update/'+activity+'/' : '');
    const authorMenu = [...card.querySelectorAll('button[aria-label]')].find(b=>/^Open control menu for post by /i.test(b.getAttribute('aria-label')));
    const author = authorMenu?.getAttribute('aria-label').replace(/^Open control menu for post by /i,'') || clean(links.find(a=>/\/(in|company)\//.test(a.href)&&clean(a.innerText))?.innerText);
    const counterLabels = [...card.querySelectorAll('button,a,p')]
      .filter(node => !bodyNode || (!bodyNode.contains(node) && !node.contains(bodyNode)))
      .flatMap(node => [clean(node.getAttribute('aria-label')),clean(node.innerText)]);
    const metric = label => {
      for (const text of counterLabels) {
        const match = text.match(new RegExp('^(\\d[\\d,.]*\\s*[km]?)\\s+'+label+'$', 'i'));
        if (match) return match[1];
      }
      return null;
    };
    const images = [...card.querySelectorAll('img')].filter(i=>! /profile|company-logo|emoji|reaction|ghost-person/.test(i.src || ''));
    return {author,posted_at:(raw.match(/\b\d+\s*(?:mo|yr|min|s|m|h|d|w)\b/i)||[''])[0],body,url,
      reactions:metric('reactions?'),comments:metric('comments?'),reposts:metric('reposts?'),impressions:metric('impressions?'),
      media:[images.length?'image':'',card.querySelector('video')?'video':''].filter(Boolean).join(' | '),media_urls:images.map(i=>i.src).join(' | '),raw_text:clean(raw)};
  }).filter(row=>row.body||row.url);
}

export function normalizeVisiblePost(row, normalize, parseMetric) {
  const metrics=['reactions','comments','reposts','impressions'];
  const normalized=normalize({...row,...Object.fromEntries(metrics.map(k=>[k,row[k]==null?0:parseMetric(row[k])]))});
  for(const key of metrics) if(row[key]==null) normalized[key]=null;
  return normalized;
}

export async function installLinkedInCompatibility(packageRoot) {
  const upstream = name => import(pathToFileURL(path.join(packageRoot, 'clis/linkedin', name + '.js')).href);
  const [profile, experience, analytics, shared, posts, postAnalytics] = await Promise.all([
    upstream('profile-read'), upstream('profile-experience'), upstream('profile-analytics'), upstream('shared'), upstream('posts-core'), upstream('post-analytics'),
  ]);
  await upstream('posts');
  const register = (name, func, extra = {}) => {
    const original = getRegistry().get('linkedin/' + name);
    cli({...original, ...extra, siteSession:'persistent', navigateBefore:false, func});
  };
  const openProfile = async (page, args) => {
    const url = profile.__test__.normalizeProfileReadUrl(args['profile-url']);
    await page.goto(url);
    await page.wait(5);
    await shared.assertLinkedInAuthenticated(page, 'Hunter LinkedIn profile reader');
    // Sections are virtualized: retain evidence at each scroll position rather
    // than reading only the last screen (which may have unmounted Analytics).
    let row = {};
    for (let step = 0; step < 11; step++) {
      const snapshot = shared.unwrapEvaluateResult(await page.evaluate(readProfilePage));
      if (snapshot) {
        for (const [key,value] of Object.entries(snapshot)) {
          if (!value) continue;
          if (key === 'raw_analytics') row[key] = [...new Set([row[key],value].filter(Boolean).flatMap(text=>text.split('\n')))].join('\n');
          else row[key] = value;
        }
      }
      if (step < 10) { await page.evaluate(scrollContent); await page.wait(0.8); }
    }
    // Preserve upstream validation and shape; never turn a login/empty page into a profile.
    profile.__test__.normalizeProfile(row);
    return row;
  };
  register('profile-read', async (page, args) => {
    const row = await openProfile(page,args);
    return [profile.__test__.normalizeProfile(row)];
  });
  register('profile-analytics', async (page,args) => {
    const row = await openProfile(page,args);
    return [analytics.__test__.normalizeAnalytics(row)];
  });
  const originalExperience = getRegistry().get('linkedin/profile-experience');
  register('profile-experience', async (page,args) => {
    const url = experience.__test__.normalizeProfileUrl(args['profile-url']);
    let resolved = url;
    if (new URL(url).pathname === '/in/me/') {
      await page.goto(url);
      await page.wait(4);
      await shared.assertLinkedInAuthenticated(page,'LinkedIn profile-experience');
      resolved = shared.unwrapEvaluateResult(await page.evaluate(() => window.location.href));
    }
    const details = experience.__test__.profileExperienceUrl(resolved);
    await page.goto(details);
    await page.wait(5);
    await shared.assertLinkedInAuthenticated(page,'LinkedIn profile-experience');
    await loadVisibleContent(page,6);
    const payload = shared.unwrapEvaluateResult(await page.evaluate(experience.__test__.buildExperienceExtractionScript()));
    if (!Array.isArray(payload?.experienceRows)) throw new Error('LinkedIn experience extraction returned malformed data');
    const rows = payload.experienceRows.map(experience.__test__.normalizeExperience);
    if (!rows.length) {
      const {EmptyResultError} = await import('@jackwener/opencli/errors');
      throw new EmptyResultError('linkedin profile-experience','No visible experience entries found.');
    }
    // Upstream expands every skill/media dialog, which can exceed the 60s command
    // budget on normal profiles. Return visible evidence without opening overlays.
    return rows.map((row,index)=>({...row,rank:index+1,total_count:rows.length,overlay_details:'not_expanded'}));
  },{description:originalExperience.description + ' (visible entries; skill/media overlays are not expanded)',columns:[...originalExperience.columns,'overlay_details']});
  const collectPosts = async (page,args) => {
    const limit=shared.parseLimit(args.limit,20,100);
    let url=profile.__test__.normalizeProfileReadUrl(args['profile-url']);
    if(new URL(url).pathname==='/in/me/') {
      await page.goto(url);await page.wait(4);
      await shared.assertLinkedInAuthenticated(page,'LinkedIn posts');
      url=shared.unwrapEvaluateResult(await page.evaluate(()=>window.location.href));
    }
    await page.goto(posts.activityUrl(url));await page.wait(5);
    await shared.assertLinkedInAuthenticated(page,'LinkedIn posts');
    const rows=new Map();
    for(let step=0;step<10;step++) {
      const raw=shared.unwrapEvaluateResult(await page.evaluate(readPostCards));
      if(!Array.isArray(raw))throw new Error('LinkedIn posts returned malformed extraction data');
      for(const item of raw) {
        const row=normalizeVisiblePost(item,posts.normalizePost,posts.parseMetric);
        const key=row.url||row.author+'::'+row.posted_at+'::'+row.body;
        rows.set(key,row);
      }
      if(rows.size>=limit)break;
      await page.evaluate(scrollContent);await page.wait(0.8);
    }
    if(!rows.size) {
      const {EmptyResultError}=await import('@jackwener/opencli/errors');
      throw new EmptyResultError('linkedin posts','No visible posts found after bounded scrolling.');
    }
    return [...rows.values()].slice(0,limit).map((row,index)=>({rank:index+1,...row}));
  };
  register('posts',collectPosts);
  register('post-analytics',async(page,args)=>{
    const rows=await collectPosts(page,args);
    const result=postAnalytics.__test__.summarize(rows);
    result.metric_coverage={};
    for(const field of ['reactions','comments','reposts','impressions']) {
      const known=rows.filter(row=>row[field]!==null);
      result.metric_coverage[field]={observed:known.length,total:rows.length};
      if(!known.length)result['total_'+field]=null;
      if(rows[0][field]===null)result['latest_'+field]=null;
    }
    return [result];
  });

}
