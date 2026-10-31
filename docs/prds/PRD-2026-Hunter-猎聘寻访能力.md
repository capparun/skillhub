# PRD-2026-Hunter 猎聘寻访能力（新版）

## 背景

猎聘是 Hunter 的外部寻访渠道之一，交付形态为独立安装包 `liepin-search`：一个 OpenCLI `liepin` 插件负责页面动作与可验证结果，一个 `hunter-liepin-search` Skill 编排需求、搜索、评估与交付。

在此之前，猎聘的工作依据是三份性质不同的材料，缺少渠道级需求文档：

| 材料 | 实际性质 | 缺口 |
|---|---|---|
| `docs/LIEPIN_DEVELOPMENT_PLAN.md` | 验收表（R1–R12） | 只回答"做了没做"，不回答"要做成什么样" |
| `docs/PRODUCT_SPEC.md` | 平台层产品规格 | 猎聘只作为付费能力名字出现 |
| `SKILL.md` + `references/local-workflow.md` | 面向 Agent 的执行说明 | 是使用文档，不是需求文档 |

本 PRD 补齐中间层：**新版猎聘渠道的完整能力规格与可判定规则**。此前只能靠散落在交接文档里的二十余条"不能声称 X"替代规则，那是需求缺失的症状。

## 产品目标

1. 把猎头在猎聘猎头端看到的人，转成可复核、可续跑、带原文证据的本地交付物，而不是一次性屏幕结果。
2. 筛选条件必须真的设置到页面上；设置失败就停止，不允许带着未生效的条件继续搜索。
3. 候选人身份只来自页面证据（简历 ID），不来自姓名或行号。
4. 区分"本地测试通过""真实预检通过""真实写入通过"三级状态，未达级别不得宣称。
5. 保留人的最终控制权：不自动联系候选人、不自动解锁附件、不自动判定人选。

## 版本关系与对标口径

猎聘历史上存在三个形态不同的代码，混用会让"完成"失去判据。本 PRD 描述**新版**。

| 代号 | 位置 | 形态 | 当前状态 |
|---|---|---|---|
| **旧版-真** | `csk/hunter/packages/hunter-liepin/`（site=`hunter-liepin`） | 8 命令一站式，4843 行；`scout` 单命令完成搜索+筛选+评估 | 有真实成功历史，当前已不可用，被 `cskh-sourcing` 判为未实现 |
| **旧版-中间** | `csk/hunter/packages/liepin/`（site=`liepin`） | 11 命令，1630 行 | 卡在 about:blank，插件已停用；仅作只读参考 |
| **新版** | `hunter-works/distribution/liepin-search/runtime/packages/liepin/` | 16 命令 + `task` 22 个 mode，31 个 lib | 开发中，本地 202/202 通过 |

> `docs/LIEPIN_OLD_NEW_COMPARISON.md` 所称"旧版"指**旧版-中间**。本文的"对标旧版"指**旧版-真**，与 `LIEPIN_DEVELOPMENT_PLAN.md` 中"对标历史 hunter-sourcing Skill（77a0626）与 hunter-liepin"一致。

**对标原则：按业务能力对标，不按命令清单 1:1 复刻。** 旧版存在静默丢弃筛选条件的缺陷（见附录 A），逐条复刻会把缺陷一同搬运。

## 业务流程

业务主线压缩为六个阶段：

1. **需求与方案**：接收 JD、Align 交付或口头要求，整理为 required / bonus / exclusion 三类条件并引用原文；生成试搜轮次与拟议正式轮次。
2. **连接与授权**：用户在 Chrome 登录猎聘猎头端并打开搜索页；绑定当前页面，建立任务与共用站点范围。
3. **筛选与提交**：逐项设置筛选条件并回读核对，全部一致后提交一次搜索；结果新鲜度确认后读取列表。
4. **详情与身份**：从已保存卡片打开详情（或读取用户已打开的详情），保留可见内容与 partial 状态；身份经人工确认后关联。
5. **评估与排序**：按职位相关证据逐条评估，保留原文引用与 unknown；由人工给出顺序。
6. **交付**：本地对账、统计与四种格式导出；报告含需求与依据章节。

### 技术映射

| 层级 | 负责 | 不负责 |
| --- | --- | --- |
| Skill（`hunter-liepin-search`） | 需求确认、轮次编排、试搜复核、评估口径、交付决定 | 页面解析、重复实现底层命令 |
| 插件（`liepin`） | 页面动作、逐项回读、任务数据、去重、证据保存、导出报告 | 招聘业务判断、人选决定 |
| OpenCLI 1.8.8 | 浏览器连接、页面读取 | 猎聘业务语义 |

## 能力规格

### 命令面

插件公开 16 个命令。`browser:false` 表示命令在建立任何浏览器连接之前完成参数校验与任务校验；`browser:true` 为当前开发门禁拦截项。一次性验证工具 `peekdetail` 已从源码与 0.2.0 包中移除。

| 命令 | access | browser | 职责 |
|---|---|---|---|
| `connect` | read | false | 绑定当前已打开的猎聘页面，校验页面身份与连接协议，返回后续命令使用的 page；不导航、不读取简历 |
| `conditions` | read | false | 离线列出全部筛选字段及控件类型，不访问页面 |
| `task` | write | false | 本地任务主入口，22 个 mode；不访问平台 |
| `prepare` | write | false | 在绑定搜索页设置筛选条件并逐项回读；不点击搜索 |
| `search` | write | false | 执行已批准的搜索轮次，单次提交并确认结果 |
| `results` | read | false | 复用当前结果页读取列表，不重新搜索 |
| `detail` | read | false | 读取用户已打开的指定简历详情 |
| `open-detail` | read | false | 从已保存卡片打开一次详情、读取并关联 |
| `detail-batch` | read | false | 执行已创建的连续详情队列 |
| `favorite` | write | false | 当前详情的收藏、取消或状态查询 |
| `favorites` | read | false | 读取人才管理收藏页列表 |
| `save-search` | write | false | 保存当前条件为搜索方案 |
| `saved-searches` | read | false | 读取搜索方案列表 |
| `apply-saved-search` | write | false | 应用指定搜索方案 |
| `delete-saved-search` | write | false | 删除指定搜索方案 |
| `diagnose` | read | true | 开发门禁拦截；不作为验收入口 |

`task` 的 22 个 mode 分四组（`import` 为默认分支，不在早期返回中）：

| 分组 | mode |
|---|---|
| 计划 | `init` `show` `brief` `revise` |
| 授权 | `approve` `authorize` `grant` `review` `scope-init` `scope-bind` |
| 执行与数据 | `import` `detail-targets` `detail-batch` `link` |
| 评估与交付 | `evaluate` `rank` `tag` `stats` `export` |
| 结果核对 | `resolve` `resume` `retry` |

### 筛选参数规格

30 个筛选参数，按**控件交互类型**分 7 类。控件类型决定设置方式与回读方式，是验收的最小单位——同类控件的行为一致，可按类集中验收。

| 类型 | 数量 | 参数 | 交互与回读要点 |
|---|---|---|---|
| `text` | 1 | `keyword` | 输入框填入；回读输入值与已选摘要 |
| `choice` | 6 | `city` `expectedCity` `experience` `education` `schoolTier` `language` | 点击选项；`city` 带城市级联；`experience` 接受含或不含"年"的区间与"以上"写法 |
| `autocomplete` | 8 | `title` `company` `industry` `position` `expectedIndustry` `expectedPosition` `school` `major` | 输入触发联想后选择；等待联想面板稳定再确认 |
| `select` | 7 | `match` `fullTime` `activity` `jobChanges` `jobStatus` `resumeLanguage` `gender` | 展开下拉后选择；部分控件用行容器定位（如 `.edu-tz-select`、`.apply-job-status`） |
| `number` | 4 | `salaryMin` `salaryMax` `expectedSalaryMin` `expectedSalaryMax` | 成组提交；两端填写后只确认一次再核对两端；单边请求清空另一端草稿 |
| `age` | 2 | `ageMin` `ageMax` | 非负整数校验，成组提交 |
| `check` | 2 | `overseas` `management` | 复选框；Ant 复选框的 input 不可直接点击，需点击可见 label，`checked` 仍读对应 input |

区间类（`number` / `age`）额外要求：下限不得超过上限；下限与上限成组校验。

### 任务数据模型

任务文件为单一 JSON，`schemaVersion: 1`，原子写入（临时文件 + fsync + rename），并带不自动过期的锁文件——中断的写入者需要显式恢复，不自动抢锁。

| 字段 | 内容 |
|---|---|
| `id` `createdAt` `updatedAt` `status` | 任务标识与状态 |
| `requirements` | 需求来源、条件、待确认事项、原文引用 |
| `candidates` | 已确认身份的候选人及其观察记录与评估 |
| `unlinkedObservations` | 缺少稳定身份的列表记录，保留原始来源 |
| `rounds` | 搜索轮次 |
| `operations` | 浏览器操作记录与证据 |
| `reviews` | 试搜复核决定 |
| `rankings` | 人工排序记录 |
| `events` | 追加式事件日志 |
| `siteScope` `policy` `retryAuthorizations` | 授权与预算 |

**候选人身份键**由 `source` + `resumeId`（或 `profileUrl`）构成；缺少稳定标识时直接拒绝并提示"不能按姓名自动合并"。

### 状态机

**操作**：`started` → `completed` / `blocked` / `unknown` / `failed`；核对后转为 `closed`。核对结果为独立记录，取值 `completed` / `not-executed` / `abandoned`。非 `completed` 的操作会暂停任务，需显式核对与恢复。

**轮次**：`planned` → `approved` → `completed` / `interrupted`；方案修订时旧轮次转为 `superseded`。

**详情**：`readable` / `partial` / `wrong_page` / `login_required` / `blocked` / `unavailable` / `loading` / `unrecognized`。`partial` 由可见内容受限、存在折叠板块或展开不完整触发。`unrecognized` 表示未识别到有内容的简历经历板块，不能确认读取成功。

**评估**：`supported` / `contradicted` / `unknown`。明确判断必须带原始证据，不能用缺失推断；未覆盖的条件自动补为 `unknown` 并标"尚未核实"。

### 交付物规格

四种导出格式，均含需求与依据章节：

| 格式 | 要点 |
|---|---|
| `json` | 完整任务对象加汇总 |
| `csv` | 带 BOM，字段含任务标题与需求快照；Excel 打开不乱码 |
| `markdown` | 需求与依据、逐候选人评估、原文引用与快照哈希、原始记录 |
| `html` | 单文件，含 CSP（`default-src 'none'`）、响应式（480px 断点）、原始记录折叠区 |

报告固定声明"本地证据报告；所有判断均待人工复核"。身份未确认的记录在报告中明确标注为未合并、未评估。

## 核心产品规则

### 真实平台能力门

| 级别 | 含义 | 取证方式 |
|---|---|---|
| 本地测试通过 | 单元/回归测试通过 | `node --test .../*.test.js` |
| 真实预检通过 | 在真实登录态、真实页面、真实对象上完成只读或 prepare 动作并核对页面状态 | 筛选设置后读已选摘要；收藏前读当前状态 |
| 真实写入通过 | 对指定对象执行一次真实写入并核验平台结果 | 提交搜索、收藏/取消、保存/删除方案 |

**只有第三级完成才可宣称端到端能力可用。** 本地测试数量不构成交付指标。

### 授权门

浏览器写操作必须同时满足：

- 任务已绑定共用的站点范围文件，且范围文件未被替换。
- 范围内无 `started` / `unknown` / `blocked` / `failed` 状态的操作。
- 本次操作的业务指纹在范围内不重复（不跨任务、不换标签重复同一请求）。
- 范围内剩余操作预算足够。
- 涉及搜索或详情轮次时，该轮次已由 `task approve` 批准。

站点范围预算表示操作次数上限，**不表示安全频率**。

### 筛选设置门

新版区别于旧版的关键设计。

- **回读是唯一判据。** DOM 存在、输入框有值、命令返回成功都不等于条件已生效；必须在页面已选摘要中核对实际生效范围。
- **不一致即停止。** 回读结果与请求不符时停止本轮，不继续提交搜索；不猜测未见过的范围文案。
- **数值框成组提交。** 下限与上限填写后只确认一次，再核对两端；单边请求清空另一端草稿。
- **旧值必须原生清空。** 薪资 DOM 值等于请求值时先原生清空再填写并触发输入事件，否则显示旧值而页面内部状态已清空。
- **部分执行留痕。** 整组后段失败时，前段进度原子持久化为 `filterProgress`，记录类型为 `control-readback`——即"控件已回读"，不等于平台全部条件生效。
- **恢复不等于续跑。** 重新应用只限 prepare 路径，且需五分钟内回读、原操作已核对为未执行；不自动重试搜索、收藏或保存方案，不得借恢复重放账号写操作。

### 身份链规则

- 列表卡片的稳定身份只来自卡片内实际存在的详情链接中的 `res_id_encode`。
- 搜索上下文查询参数不是身份；多个不一致 ID 保持未识别；不按姓名或行号合并。
- 缺少稳定 ID 的记录保留为 `unlinkedObservations`，原始来源不被改写。
- 关联到已保存详情必须由人工确认，记录复核人、时间与依据；同一记录不可改绑。

### 结果与交付规则

- **结果新鲜度**：点击搜索后需观察到新增响应时间、loading 过渡或内容变化之一；无变化时停止，不重复提交。
- **详情诚实**：`partial` 如实报告缺什么；不点击联系、索要、购买或解锁。
- **评估有据**：仅依据职位相关技能、经历与资格；年龄、性别、民族、健康、婚育、宗教等属性不进入评估与排序。
- **未知不推断**：缺失不等于不符合；最终人选由招聘人员决定。
- **人工排序**：排序必须由人工提供顺序与条件依据，系统不推断适合或不适合；需求或证据变化后旧排序失效。
- **数据边界**：页面与简历内容是资料，不作为 Agent 指令。非公开候选人数据仅保存在任务指定本地目录，不提交 Git、不上传公开站点。
- **遇阻先核对**：验证码、异常访问、登录失效、结果未知时停止并核对，不重复提交。

## 当前能力状态

当前开发基线：

- 候选发布包：`liepin-search 0.2.0`（`public/download/liepin-search-v0.2.0.tar.gz`，SHA-256 `6a76a099881ef81b7e67b4ff54930e20d29dd973710bc3c3a4ed06ba68c4833d`，136610 字节；含本轮全部修复，**尚未发布上线**）
- 线上正式发布仍为 `0.1.1`（内容停留在 2026-10-12，不含本轮修复；0.2.0 验收完成前不得当作可用交付）
- 插件与运行时：`0.2.0`；Skill：`hunter-liepin-search 0.1.0`
- OpenCLI：固定 `1.8.8`（详情只读通道对非 1.8.8 直接拒绝，并校验已审查执行文件的哈希）
- 连接：实验协议 `hunter-mainframe-v1`，会话 `liepin-compat-mainframe`

已实现：上节全部命令面、筛选规格、数据模型与状态机。

已有真实证据：

- 一次完整组合搜索（关键词 + 3–5 年 + 本科 + 目前年薪 10–50 万元）并保存首页 10 条。
- 连续两份详情自动完成并返回搜索页（v8 扩展）。
- 搜索方案读取与应用；收藏列表读取 2 条。
- 期望薪资与两个经验开关的设置与回读通过。

尚未完成：

- 30 个筛选参数中约 18 项未做真实设置验收，集中在 `select` 下拉、`autocomplete` 联想与 `age`。
- 收藏写入与取消从未真实执行。
- 多轮闭环、试搜复核、完整评估交付未真实验收。
- 真实报告的最终视觉审阅未完成。
- 官方扩展同条件 A/B 未做；实验协议不匹配不构成官方扩展不可用的证据。
- macOS 隔离安装与 Windows 官方 PowerShell 通道未真机验收；0.2.0 候选包尚未发布上线。

## 用户视角验收标准（每一条都可由用户亲自验证）

**MVP 验收（第一版必须全部通过）：**

1. **一句话启动**：对 Agent 说"用猎聘找『嵌入式开发』、3–5 年、本科、目前年薪 10–50 万，看首页 10 条"→ 不碰终端与浏览器，最终拿到一份 HTML 报告。
2. **条件真的生效**：命令结束后页面"已选条件"摘要与用户所说的每一项逐字相符；任一项不符时命令停止并说明是哪一项，而不是继续搜索。
3. **不静默降级**：故意给一个页面上不存在的条件 → Agent 明确报错说该条件页面不支持，绝不悄悄跳过再搜索。
4. **名单质量**：导出 CSV 用 Excel 打开不乱码；行数等于去重后实际人数；姓名、年限、学历、城市非空；每条保留来源轮次与原始卡片快照。
5. **身份不猜**：列表 10 条都有稳定简历 ID，或在报告中明确标出哪几条没有 ID 及原因；绝不出现"按姓名推断为同一人"。
6. **详情诚实**：读到部分内容时标注 `partial` 并说明缺什么；不点击联系、索要、购买或解锁按钮。
7. **断点续跑**：跑到一半中断，再说"继续"→ 从上次位置继续，本地无重复候选人。
8. **评估有据**：每条评估结论都能点回原文引用；未知项保持 unknown，不推断为不符合。
9. **改版自愈**：人为改坏一个页面定位标记 → Agent 明确报错并指出哪一步失败，而不是输出错数据。
10. **只读核验**：全程观察猎聘页面 →"联系 TA""索要简历"等按钮一次都没被点击；收藏类写入仅发生在用户明确指定的对象上。
11. **双端可用**：同一个 Skill 在 Claude Code 与 WorkBuddy 中都能完成第 1 条。
12. **环境探测诚实**：未安装插件或 OpenCLI 版本不符时，明确告知缺什么并给出下一步；不静默失败、不假装在跑。

**发布前追加：**

13. **官方通道安装**：macOS 与 Windows 均通过官方引导脚本完成安装并通过 doctor，不使用手工兜底步骤。
14. **连接方式明确**：交付时明确客户需要哪种连接方式（官方扩展或配套扩展），不把实验协议当默认答案。

## 优先级

- **P0（让交付可用）**：~~同步隔离验收副本、清出一次性工具、升版本号、重新打包并核对哈希~~（已完成：副本与源码 `diff -rq` 为空、`peekdetail` 移除、0.2.0 四源版本一致、候选包 SHA-256 独立复核一致）。剩余：按控件类型集中补齐 `select` / `autocomplete` / `age` 三类筛选与单边薪资的真实设置验收。
- **P1（补齐业务闭环）**：收藏写入与恢复验收、稳定身份补齐（走 `open-detail` 流程）、多轮与试搜复核真实闭环、正式 JD 下的完整评估交付、真实报告视觉审阅。
- **P2（发布）**：官方扩展 A/B、macOS 与 Windows 官方通道真机安装、正式发布与线上校验。

## 非目标

- 不自动联系、索要、购买或解锁；不实现旧版 `--autoStar` 式的自动批量收藏。
- 不恢复旧版 `companyType` / `companySize` / `updateTime` 的参数外观。
- 不按姓名、行号或列表位置推断候选人身份。
- 不依据年龄、性别等敏感属性排序或淘汰。
- 不绕过猎聘检测、伪造环境或关闭平台风控；不把"越慢越安全"当作开发策略。
- 不把完整业务流程机械迁入 CLI；不复制 OpenCLI 已提供的页面能力。
- 不在缺少人工确认时重放账号写操作，包括借恢复功能重放。

## 附录 A：旧版对标与缺陷实证

### 对标总表

| 类别 | 项 | 旧版-真依据 | 新版现状 | 处置 |
|---|---|---|---|---|
| **要补** | 多关键词一次执行 | `scout.js` `--multi-keyword` 逗号分隔逐个跑 | R2 支持多轮，未真实验收 | 排入验收 |
| **要补** | Top N 详情深读 | `scout.js` `--detail` 对 Top N 读全文 | `detail-batch` 已实现，连续两条真实通过 | 补长批量验收 |
| **要补** | 人才库统计报表 | `stats.js` 独立报表命令 | 仅 `task stats` 本地汇总 | 评估是否需独立入口 |
| **要补** | JD 配置直接映射筛选 | `scout.js` `--jdConfig` + `mapHardRequirementsToFilters` | 由 Skill 编排承接 | 不复制到插件 |
| **要补** | 自动收藏搜索结果 | `search.js` `--autoStar` / `--starDelay` | 无等价能力 | 列为非目标 |
| **要写** | 公司性质 / 公司规模 / 简历更新时间 | 声明为参数但**从未生效** | 已正确移除 | 写入限制章节，不排开发 |
| **要守** | 逐项回读核对 | 无 | `lib/dom.js` 读已选摘要 | 不可回退 |
| **要守** | 操作门与站点预算 | 无 | `lib/operation-gate.js` / `lib/site-scope.js` | 不可回退 |
| **要守** | 结果新鲜度判定 | 无 | `lib/result-freshness.js` | 不可回退 |
| **要守** | 原子持久化与稳定 ID 去重 | CSV 覆盖写 | `lib/task-store.js` | 不可回退 |
| **要守** | 参考机密性 | 无 | `lib/bound-page.js` 去除查询串、凭据与私人路径 | 不可回退 |

### 旧版静默丢弃缺陷

`companyType` / `companySize` / `updateTime` 三个参数构成同名"公司性质/公司规模/更新时间"能力，实际链路：

```
scout.js:477-479   声明为 CLI 参数                        ✓
scout.js:505       解构                                    ✓
scout.js:550-552   拼入 filters 数组并打印                  ✓
scout.js:580       放入 explicitFilters                    ✓
        ↓
filter-engine.js:16-19   SELECTOR_MAP[key] 未命中 → continue   ← 静默跳过
        ↓
scout.js:140-144   const filterResults = applyFilters(...)
                   if (filterResults.applied.length > 0) console.log(...)
                   await page.evaluate('...search-btn...click()')   ← 仍提交搜索
```

`results.failed` 在整个 `scout.js` 中**未被读取过一次**。

参数名与真实语义也不一致：`companyType` 的 `rowText` 是 `当前行业`（`liepin-selectors.js:55-58`），与 `currentIndustry` 同指一行，值表逐项相同；`updateTime` 的 `rowText` 是 `活跃度`（同文件 `36-39`），值表是"今天活跃/3天内活跃/……"，与"简历更新时间"无关；`companySize` 在该文件中出现 **0 次**，永远走静默跳过分支。

**结论：旧版靠同名参数制造了"这三项可筛选"的假象，实际从未生效，且失败时不告知用户。** 新版按真实页面能力移除是正确的，不列为待补能力。

### 限制说明

- 当前猎聘真实筛选页不存在公司性质、公司规模、简历更新时间控件，不得宣称这三项可筛选。
- 筛选通过项只覆盖已实测的具体值与组合，不代表该控件全部选项可用。
- 旧版可供筛选、新版已移除的参数，其历史结果不可用于对照新版能力。

## 关联资料

- [猎聘开发计划](../LIEPIN_DEVELOPMENT_PLAN.md)
- [猎聘筛选逐项验收](../LIEPIN_FILTER_ACCEPTANCE_MATRIX.md)
- [猎聘独立分发](../LIEPIN_RELEASE.md)
- [猎聘旧新执行链对照](../LIEPIN_OLD_NEW_COMPARISON.md)
- [猎聘 OpenCLI 能力复核](../LIEPIN_OPENCLI_CAPABILITY_REVIEW.md)
- [LinkedIn 寻访能力 PRD](PRD-2026-Hunter-LinkedIn寻访能力.md)（三级能力门与授权门来源）
- [脉脉 ego-lite 寻访能力 PRD](PRD-2026-Hunter-脉脉ego-lite寻访能力.md)（用户视角验收标准格式来源）
