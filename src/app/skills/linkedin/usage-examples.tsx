'use client';

import { useState } from 'react';
import styles from './usage.module.css';

const examples = [
  {
    "id": "brief",
    "group": "需求与搜索",
    "title": "把 JD 整理成人才画像",
    "input": "岗位JD、硬性要求和待确认事项",
    "output": "经你确认的人才画像与寻访方案",
    "prompt": "我想在 LinkedIn 找这个岗位的人：【粘贴JD】。请先使用职位需求对齐 Skill，整理岗位相关的硬性条件、加分项、目标公司和待确认问题，形成寻访方案让我核对。不要自行确认画像，也不要立即搜索。"
  },
  {
    "id": "search",
    "group": "需求与搜索",
    "title": "按确认的画像试搜一轮",
    "input": "已确认的画像、本轮目标人数、是否读详情",
    "output": "实际候选人列表、来源和列表初评",
    "prompt": "使用 LinkedIn 寻访 Skill，按我已确认的画像【画像文件或项目名称】做一轮快速验证，目标15人，本轮不开启详情深读。先核对关键词与渠道，优先使用 X-Ray 搜索公开线索。需要切换到站内搜索时先确认账号和本轮范围；返回实际人数、来源链接、列表初评与待核实项，不承诺一定找到15人，不发邀请或消息。"
  },
  {
    "id": "report",
    "group": "评估与报告",
    "title": "生成比较报告与短名单",
    "input": "已有寻访任务、确认过的岗位要求",
    "output": "候选人比较、初选与复核状态、四格式本地报告",
    "prompt": "请根据当前 LinkedIn 寻访任务整理比较报告，引用与岗位相关的技能、经历和职责证据，区分已支持、不符合与未知。保留初评和详情复评的差异，说明名单变化原因；没读详情的明确标注仅列表依据。最终人选由我复核。请输出 Markdown、CSV、JSON 和 HTML，告诉我本地路径；先给我看HTML报告概要，不上传或分享资料。"
  },
  {
    "id": "keywords",
    "group": "需求与搜索",
    "title": "准备英文关键词与搜索路径",
    "input": "已确认的人才画像和目标地区",
    "output": "2–4组英文关键词、各组用途与路径建议",
    "prompt": "基于已确认的画像【项目名称】，准备2–4组 LinkedIn 英文搜索关键词，说明每组对应哪些岗位要求。区分搜索页面可用条件与本地评估条件，比较 X-Ray、站内搜索以及我有权限时的 Recruiter 路径。先给我方案，不执行搜索。"
  },
  {
    "id": "xray",
    "group": "需求与搜索",
    "title": "先从公开搜索线索找人",
    "input": "已确认画像、本轮人数",
    "output": "公开搜索线索、实际搜索源与待验证信息",
    "prompt": "按已确认画像【项目名称】做 X-Ray 发现，目标【人数】人，不打开候选人 LinkedIn 详情。先检查浏览器桥接和搜索适配器，报告实际搜索来源和结果。搜索摘要可能过时，不当作已核实履历；遇到验证或限制按实际状态停止或请我处理，不宣称可以绕过平台限制。"
  },
  {
    "id": "detail",
    "group": "详情与复核",
    "title": "只深读初选名单中的人",
    "input": "已有初选名单、明确的主页链接与人数",
    "output": "可见详情证据、复评结果和字段缺口",
    "prompt": "继续当前 LinkedIn 任务，开启详情二评，只读取我确认的初选名单【名单或主页链接】，最多【人数】人。先核对登录态，按岗位需要读取可见主页、工作或项目经历；不要无条件遍历所有信息。保留初评，再基于详情复评。缺失字段标为未知，不将解析不到学历等同于候选人没有学历，不联系候选人。"
  },
  {
    "id": "compare",
    "group": "详情与复核",
    "title": "比较几位候选人的岗位证据",
    "input": "已保存的候选人名单、关键岗位要求",
    "output": "逐项对照表、差异与待核实问题",
    "prompt": "请比较当前任务里这几位人选：【名单】。只使用已有的列表和详情证据，对照【关键岗位要求】列出支持证据、差异与待核实问题。不要把缺失信息判为不符合，不依据年龄、性别等与岗位能力无关的属性排序或淘汰。无需追加搜索或访问页面，最终选择由我决定。"
  },
  {
    "id": "revise",
    "group": "评估与报告",
    "title": "试搜不理想，先诊断再调整",
    "input": "已有结果、希望改变的条件",
    "output": "覆盖情况、问题定位与下一轮建议",
    "prompt": "当前 LinkedIn 试搜结果不理想，请先分析关键词、地区、来源覆盖和证据缺口。我想调整【具体条件】，请列出与原方案的差异，保留旧结果。我确认新方案后再续跑，不自动降低其他要求，也不为了凑数量不断搜索。"
  },
  {
    "id": "connect",
    "group": "连接与排错",
    "title": "检查安装与浏览器连接",
    "input": "安装回执、Chrome和所需搜索路径",
    "output": "Skill、命令、浏览器与登录态的检查结果",
    "prompt": "请检查 LinkedIn 寻访环境。按安装回执定位运行时与Skill，确认 linkedin 和 hunter-linkedin 所需命令实际存在，再检查 Chrome 与官方 OpenCLI 扩展连接。X-Ray与站内搜索的登录要求分别说明；需要站内搜索或详情时再核对LinkedIn登录态。此步不搜索候选人，不读人脉，不发邀请或消息。"
  },
  {
    "id": "resume",
    "group": "连接与排错",
    "title": "任务中断后继续已有工作",
    "input": "当前项目和脱敏报错",
    "output": "已完成内容、失败原因和可继续的步骤",
    "prompt": "LinkedIn任务中断了：【脱敏报错】。请先读取已有配置、结果和检查点，说明哪些已完成，哪些未确认。复用已保存结果，不整轮重跑；区分浏览器连接错误、搜索无结果与实际账号限制。验证码或限制由我处理，不索取密码、Cookie或令牌。"
  }
];
const groups = ['常用任务', '需求与搜索', '详情与复核', '评估与报告', '连接与排错', '全部'];

export function LinkedInUsageExamples() {
  const [group, setGroup] = useState('常用任务');
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState(false);
  const visible = group === '常用任务' ? examples.slice(0, 3) : examples.filter(item => group === '全部' || item.group === group);
  async function copy(id: string, prompt: string) {
    try { await navigator.clipboard.writeText(prompt); setCopied(id); setError(false); }
    catch { setCopied(''); setError(true); }
  }
  return <section id="usage-examples" className={styles.usage} aria-labelledby="usage-heading">
    <header className={styles.sectionHeading}><div><p className={styles.eyebrow}>安装好了，接下来怎么用</p><h2 id="usage-heading">你想做什么？</h2></div><p>选一个任务，复制问法给 AI 助手。</p></header>
    <ol className={styles.usageFlow} aria-label="LinkedIn寻访流程"><li>确认人才画像</li><li>确认方案与搜索</li><li>初选与按需深读</li><li>复评与报告</li></ol>
    <nav className={styles.usageFilters} aria-label="按使用场景筛选">{groups.map(value => <button key={value} aria-pressed={group === value} onClick={() => { setGroup(value); setOpen(null); setCopied(''); setError(false); }}>{value}</button>)}</nav>
    <p className={styles.usageHint}>替换【括号里的内容】，发给已安装LinkedIn Skill 的助手。<a href="#install-center">尚未安装？先完成安装与连接 →</a></p>
    <div>{visible.map(item => <article key={item.id} className={styles.usageRow}><div className={styles.usageTop}><div><h3><button aria-expanded={open === item.id} aria-controls={`usage-${item.id}`} onClick={() => setOpen(open === item.id ? null : item.id)}>{item.title}<span aria-hidden="true">{open === item.id ? '−' : '+'}</span></button></h3><p>{item.output}</p></div><button className={styles.secondary} aria-label={`复制“${item.title}”问法`} onClick={() => copy(item.id, item.prompt)}>{copied === item.id ? '已复制 ✓' : '复制问法'}</button></div><div id={`usage-${item.id}`} hidden={open !== item.id} className={styles.usageBody}><dl><dt>你提供</dt><dd>{item.input}</dd><dt>你得到</dt><dd>{item.output}</dd></dl><p className={styles.eyebrow}>发给 AI 助手的完整问法</p><p className={styles.usagePrompt}>{item.prompt}</p></div></article>)}</div>
    <p className={styles.usageHint}>{group === '常用任务' ? '先从这 3 个常用任务开始，其他用法可按分类查看。' : `当前显示 ${visible.length} 个示例`}</p>
    <p role="status" aria-live="polite">{copied ? '问法已复制，可粘贴给 AI 助手。' : ''}</p>{error && <p role="alert" className={styles.error}>复制失败，请展开问法后手动选择文字复制。</p>}
    <details className={styles.details}><summary>使用前需要了解的边界</summary><p>这些问法以当前正式包支持的流程为依据，不代表已经执行真实寻访。X-Ray 使用搜索引擎公开线索，摘要可能过时；站内搜索、Recruiter 和详情读取受账号权限及平台限制影响，不能保证数量或完整资料。</p><p>详情默认不开启，开启前确认人数和范围。部分字段可能无法解析，缺失不等于不符合。名单和评分用于辅助人工复核，不自动邀请、发消息或联系候选人；报告默认保存在本地，未经授权不上传或分享。</p></details>
  </section>;
}
