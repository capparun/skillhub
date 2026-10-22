# opencli-mcp 能力与边界（0.0.30，2026-10-22 实测整理）

本文件记录我们依赖的浏览器自动化框架 opencli-mcp 的真实能力面和我们代码实际使用的边界。
依据：安装包内 `docs/`（api-reference、tab-lifecycle、sites、errors、js-tool、capabilities/*）、
`adapter-sdk/index.d.ts`（适配器契约的唯一真源），以及本机实测（2026-10-22）。

## 1. 进程模型

```
MCP 客户端（stdio）
   └─ dispatch.mjs ──> opencli-mcp/dist/src/main.js   （每客户端一个进程）
          └─ IPC socket 连接「浏览器宿主」
                 ~/.opencli-mcp/run/<uuid>.json 记录 pid + socket + browserId
                 宿主进程 cwd 落在某个安装的 browser/hosts/<指纹>-<hash>/
                 └─ Chrome 扩展（native messaging）
                        ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.opencli.mcp.json
                        的 path 指向某个安装的 browser/hosts/.../launcher
                        └─ 页面（tab）
```

关键事实：

- **宿主是长驻进程**，按 pid 存活判定复用；MCP 客户端连上已存在的宿主，而不是自建。
- **适配器代码在宿主进程内执行**。因此宿主来自哪个安装，决定了实际跑哪份适配器。
- native messaging 清单里的 `path` 在安装时写入，**不会随后续安装自动更新**（详见交接文档 11.3 的陷阱）。

## 2. 标签归属（踩过坑的地方）

| 对象 | 归属 | 可用操作 |
| --- | --- | --- |
| `browser.tabs.new()` 创建的标签 | 本会话 agent | `tab.act/evaluate/url/close/release` |
| `browser.user.claimTab({tabId})` | 仅限**用户标签**（先 `browser.user.openTabs` 发现） | claim 后同上；`expectedUrl` 校验当前身份 |
| 站点适配器绑定的标签 | 站点会话（如 `site:liepin`） | 只能通过该站点的 `sites.run` 命令操作 |

- 适配器会话持有的页面，客户端直接 `tab.url()`/`tab.act()` 会报 `page belongs to session site:liepin`；
  `browser.user.claimTab` 会报 `claim_not_allowed`。**这是设计，不是故障。**
- `tab.release()` 保留页面、放弃控制；`browser.tabs.finalize()` 结束会话；崩溃的客户端会留下
  会话租约，此时 `browser.user.closeTabs` 拒绝关闭（`Tab is gone or controlled by a session`），
  只能用 `browser.chrome.call('tabs.remove',[id])` 兜底。
- 页面 handle 在导航期间稳定，标签关闭后失效（`stale_page`）。

## 3. 适配器契约（adapter-sdk/index.d.ts 是唯一真源）

```ts
defineAdapter({ description, access:'read'|'write', domain?, args, aliases?, run(ctx) })
ctx = { args, tab, sites, recon, signal }
```

- 适配器目录：包内 `adapters/<site>/<command>.js`（builtin）+ `~/.opencli-mcp/adapters/<site>/`（用户覆盖，后者优先）。
  我们的 liepin 适配器是 builtin 壳，`export {default} from '../../../../tools/liepin-mcp/adapters/liepin/xxx.js'`。
- 调用方式：`sites.run(site, name, args)`，或 `sites.enable(site,{write:true})` 后走 `<site>_<command>` 工具。
- `tab` 与 `js` 工具里的 Tab 同一套面；适配器只能看到 `adapter-sdk` 声明的子集。

## 4. 交互成本模型（实测，2026-10-22）

`tab.act` = 定位 → 等可操作 → hit-test → 真实输入 → settle。单次动作的墙钟：

| 动作 | 耗时 | 说明 |
| --- | --- | --- |
| `tab.evaluate` | 4–15ms | 基础往返 |
| `tab.url()` | 8–20ms | |
| `hover`（settleMs=150） | 214–238ms | 1 次鼠标事件 |
| `click`（cdp） | 659–686ms | `armClickProbe` + mouseMoved/Pressed/Released + `readClickProbe`，约 5 次跨进程调用 |
| `click`（`method:'dom'`） | 613–615ms | 只省约 45ms |

`settleMs` 生效但只占其中约 150ms；点击的固定部分来自扩展的落地探测与导航观察窗，
**适配器层无法压缩，只能减少点击次数**。

## 5. 我们代码实际使用的面

搜索链路（`lib/search-driver.js` → `createSearchDriver`）是**封闭能力面**，代码注释即契约：

> Fixed capability adapter. No arbitrary evaluate, navigation, network replay, capture fallback
> or access to the underlying OpenCLI Page escapes this object.

只暴露：固定只读观察器（`inspect`/`inspectRecords`）+ 固定动作（click/fillText/hover/scrollTo/scroll/Escape）。
收藏链路（`tools/liepin-mcp/lib/site-adapter-favorite.mjs`）用 `tab.evaluate(inspectFavorite)` + `tab.act({action:'click',settleMs})`。

框架提供但**我们的驱动刻意不用**的能力：`tab.fetchJson`（经页面调用站点自身 API）、`tab.expect`
（轮询断言）、`tab.network.*`（被动捕获）、`recon.discover`（端点发现）、任意 `evaluate`、导航。

含义：性能优化只能落在「减少点击次数」和「把固定 sleep 换成事件驱动」上；
走站点 API 的快速通道与当前防检测姿态（只发真实用户输入、不重放接口）相冲突，属于产品决策，不是工程优化。

## 6. 错误码要点（按 code 分支，不按 message）

- `claim_not_allowed` / `page belongs to session`：想把适配器页面当用户页面操作。
- `page_released` / `stale_page`：finalize 或关闭后仍用旧 handle。
- `command_outcome_unknown` / `not_delivered`：动作可能已生效或未送达，先观察再决定，不自动重放。
- `js_busy`：上一个 JS 调用未返回（元素解析超时后会出现，见交接文档 11.4）。
- `host_unavailable`：Chrome 未启动或宿主未连；先查 `~/.opencli-mcp/run/`。

## 页面动作清单（按页面类型，2026-10-22 核对）

命令名以 `tools/liepin-mcp/adapters/liepin/` 为准，参数与语义取自适配器定义与实现。

### 列表页（搜索结果页）

| 动作 | 命令 | 读/写 | 得到什么 / 边界 |
| --- | --- | --- | --- |
| 读当前页卡片 | `results` | 读 | 每张卡：姓名、当前公司、当前职位、工作年限、学历、城市、期望、技能、求职状态、整卡文本；卡片选择器、姓名选择器、卡内全部链接。`limit` 1–30。不翻页、不重搜 |
| 拿候选人 ID | 无独立命令，但 ID **实际存在** | — | 行级 class 为 `tr.r-<resId>`，与详情 URL 的 `res_id_encode` 同值（实测 30/30 条观察记录可解析，13/13 已收藏者命中）。产品当前只读卡片内 `<a href>`，所以报 `no-detail-link`——是**没去读 class**，不是页面上没有 ID |
| 点开详情 | `open-detail` | 写 | 核对卡片未变（`observation_id`+`hash`）→ 点姓名 → 新开详情 → 读正文 → 关联身份 → 关闭返回列表 |
| 从列表直接收藏 | `favorite-list` | 写 | 按已保存的观察记录从列表点开该人 → 收藏到指定组 → 回读 → 关闭返回列表。可用 `verify_only` 只核对。要求该观察已有身份 |
| 提交搜索 | `search` | 写 | 一次查询 + 按授权页数逐页读取保存；`restore` 才允许在已有授权下恢复并重提交 |
| 设筛选 | `prepare` | 写 | 设置并回读筛选，不点搜索；站点可能自动查询 |
| 搜索方案 | `saved-search` | 写 | 列 / 存 / 用 / 删 |
| 标签管理 | `tabs` / `bind` / `connect` | 读 / 写 / 写 | 列支持标签、绑定已有标签、新开搜索页 |

### 详情页

| 动作 | 命令 | 得到什么 |
| --- | --- | --- |
| 读当前详情 | `current-detail` | 已绑定详情的可见正文 + 完整性状态；`expand` 可展开经历 |
| 收藏三态 | `favorite` | `status` 核对 / `add` 加入分组 / `remove` 取消；写后回读 |

### 收藏夹页

| 动作 | 命令 | 得到什么 |
| --- | --- | --- |
| 读收藏列表 | `favorites` | 当前可见条目、分组回读；`workspace:true` 另开工作页核验；不翻页、不改收藏 |

### 跨页批量

| 动作 | 命令 | 得到什么 |
| --- | --- | --- |
| 详情队列 | `detail-batch` | 继续本地已创建的详情队列，逐条保存并返回搜索页；跳过已完成项，未知状态暂停 |

### 明确没有的能力

- 列表页批量勾选 + 批量收藏
- 独立的翻页 / 跳页动作（页数只是 `search` 参数，等于重搜）
- 列表页读候选人 ID 的**现成命令**（ID 在行 class `r-<resId>` 里，但产品尚未解析）
- 收藏夹翻页

## 更正：列表页 ID 与翻页，代码里已有实现（2026-10-22 08:0x）

前一版"列表页拿不到 ID""没有翻页动作""capture 从未接线"三条都不准确。逐条更正：

### 1. 列表页 ID 有三个载体，只用了最弱的一个

| 载体 | 现状 | 代码 |
| --- | --- | --- |
| 卡片内详情链接 `<a href>` | 空（30/30 观察记录 `detailLinks` 均为 `[]`） | `identifyListRow` 只认这个，所以报 `no-detail-link` |
| 行 class `tr.r-<resId>` | 30/30 可解析，与详情 URL 的 `res_id_encode` 同值，13/13 已收藏者命中 | **无任何代码解析**；`records-dom.js` 的 `path()` 只是把 class 拼进选择器 |
| 搜索接口响应 `search-resumes` | 完整实现 | `engine.js:392 attachIds` |

`attachIds` 做的事：在 `api-h.liepin.com` 上开始被动捕获 → 取 `search-resumes` 的 200 响应 → 解析 `data.resList` → 按列表顺序与卡片对齐 → 用脱敏姓名前缀校验（对不上就不给 ID，不猜归属）→ 补 `resumeId`(resIdEncode)、`resumeUserId`、`detailUrl`、年龄、性别、公司、职位、工作经历、教育经历、更新时间、在线状态、是否有附件简历。字段白名单明确排除 `resEname`（真名）、`cPhoto` 等。

### 2. 但它被两道闸关死，是死分支

- 闸一：`bound-search-task.js:18` 写死 `capture:false`。
- 闸二：`search-driver.js` 是冻结能力面，注释原文 "No arbitrary evaluate, navigation, network replay, capture fallback or access to the underlying OpenCLI Page escapes this object"，**不暴露** `startNetworkCapture` / `readNetworkCapture`。
- 结果：`engine.js:376` 的 `capturing` 恒为 false，接口分支永不执行。

### 3. 翻页机制早就在

`engine.js:444-477`：按 `pagination.next` 点"下一页" → 等 2s → 重读 → 页码或首行都未变化则停止并保留已读；观察器 `dom.js:84-100` 已返回 `current/next/totalPages`。缺的只是"把翻页暴露成独立命令"，不是缺机制。

### 结论

"每页重搜"不是页面限制造成的，是**两处默认关闭**造成的：身份来源被限制成 href，翻页被限制成 search 内部循环。开启任一条，都能把"一页一轮"改成"一轮到底"。

## opencli-mcp 的页面探索能力（2026-10-22 实测）

框架提供，且与"站点适配器"分属两层：

| 能力 | 签名 | 用途 | 实测结果 |
| --- | --- | --- | --- |
| DOM 概览 | `tab.observe({format:'dom', limit})` | 可见控件、属性、表单实时值、开放 shadow root | 猎聘收藏夹页返回 `{url,title,snapshotId,dom:{entries,scope,start,total}}`，36 条，每条含 `attrs/ref/tag/text/truncated` |
| 查询检索 | `tab.find({query, limit})` | 按查询在 DOM 证据里找元素，独立于 ARIA 树 | `find({query:'showresumedetail'})` 在收藏夹页返回 `role=link` 条目（含候选人姓名链接） |
| 精确读 | `tab.read({target:{selector}})` 或整页有界扫描 | 单个目标的完整文本/属性/实时值，不滚动 | `read('tr[class*="r-"]')` 在收藏夹页报 `no element matches`，说明该页结构与搜索结果页不同 |
| 网络证据 | `tab.network.start/list/detail` | 原始请求与响应，游标分页 | 未实测 |
| 接口发现 | `recon.discover(tab)` | 从真实流量排出候选接口，`{includeStatic:true}` 附带静态分析 | 已确认存在（`typeof recon==='object'`，键为 `discover`） |
| 其它 | `frames / expect / screenshot / act / cdp / webmcp / console / cookies / fetchJson` | 帧枚举、断言、截图、动作、CDP、页面内工具、控制台、Cookie、页面内取数 | 此前已实际用过 `act / screenshot / cdp / evaluate` |

### 关键边界

1. **站点适配器持有的标签，客户端摸不到**（`page belongs to session site:liepin`）。所以产品内部只能用自己的冻结观察器（`inspect` / `inspectRecords`），探索能力对适配器不可见。
2. 自己开的标签完全可用 —— 本次探索就是这样做的。
3. 探索是"证据"，不是契约：`recon` 只能给候选接口，字段语义、分页、鉴权都要再验证。
