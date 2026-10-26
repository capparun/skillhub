# LinkedIn 能力使用与 Skill 维护手册

核对日期：2026-10-24。范围：当前统一网关、旧Hunter LinkedIn寻访/触达与底层OpenCLI。P/T为本包入口，R/O为外部既有入口；未接入不等于不存在，不声称穷尽LinkedIn全平台命令。版本：0.1.0-dev.11，开发中，未正式发布。

粒度：一个可独立调用、有确定输入输出的功能。平台动作、任务支撑、模型判断分层；批处理和报告是组合支撑能力，明确标注，不当作平台原子动作。筛选条件是搜索参数，不重复包装成几十个搜索功能。


> **全局补充审计**：[LinkedIn全局能力复盘](LINKEDIN_GLOBAL_AUDIT.md)逐项登记25条底层命令、15条Hunter扩展，以及X-Ray/深读等脚本。原P/T/R/O清单是能力入口索引，不是完整注册命令表；未接入不等于不存在。

> **文档目标**：用户能知道“我可以让 Agent 做什么、需要提供什么、会得到什么”；Agent 能据此选择能力、组合任务、定位缺口并更新业务 Skill。本文是能力索引与使用契约，运行代码决定实际支持范围，验收记录决定可声明的验证范围。

**阅读入口**：用户先看“按需求选择能力”和“结果怎么看”；执行 Agent 看“调用方式”“最小调用示例”和原子表；维护 Agent 看“Skill 更新地图”和“变更验收”。P/T 编号为稳定引用，后续增补不重排、不复用已删除编号。触达请看“既有Reach/Outreach能力”；其外部命令不能直接传给本包task-execute。

<a id="user-guide"></a>
## 按需求选择能力（用户入口）

你不需要手写 JSON，可以直接告诉 Agent 下面的需求。示例中的行业、数量、角色均为每次任务参数，不是默认业务规则。

| 你想做什么 | 可以这样说 | 需要提供 | Agent 使用哪些能力 | 你会得到什么 |
|---|---|---|---|---|
| 检查能否使用 | “检查指定 Chrome 账号能不能用 SalesNav” | Chrome Profile、预期 LinkedIn 身份 | P01 → P03；普通 LI 用 P04 | 连接、身份、权限分别说明，缺什么就指出什么 |
| 找目标公司 | “找符合这些条件的公司，给我表格和依据” | 行业/地区/规模等条件、目标数量、哪些必须满足 | T02 → P03/P05/P06 → P07 → P10/P11 → T09/T11 | 公司表、来源、判断理由、已读/总数与缺口 |
| 在公司内找人 | “从这几家公司找当前担任某角色的人” | 已选公司、角色/地区等人员条件、目标数量 | T04 → P06 → P08 → P12 → T09/T11 | 人员表与来源公司；当前任职仍需详情核实 |
| 搜索普通 LI 人员 | “用普通 LinkedIn 按这些职业条件找人” | 关键词与人员条件、指定账号 | P04 → P09 → P13 | 人员资料；当前完整真实搜索仍待验，不能保证生产可用 |
| 读取指定对象 | “查看这个公司/个人链接并解释有哪些资料” | 支持的公司或人员链接 | P11/P12/P13 | 实际读到的字段、来源和缺失项 |
| 接着上次做 | “从上次任务继续，别重头搜” | 原任务目录或任务标识 | T08 → 依覆盖选P10或详情 → T09/T11 | 在原账本上增加结果，保留已有判断 |
| 联系已确认的候选人 | “对已确认最终名单准备触达计划，先给我审核” | 已确认JD/JBF、最终短名单、触达意图；按既有Skill逐人确认 | 外部cskh-outreach，R01–R13、O01–O03 | 关系状态、渠道建议、内容草稿、审批后执行回执；本次盘点不发送 |
| 导出或重新整理 | “将已有结果做成能看懂的表格” | 原任务与评估版本，或已有数据文件 | T11；文件格式转换用P15 | HTML/CSV，不额外读取平台 |

**使用前准备**：Node.js 22+、可用 OpenCLI、已连接的 Chrome Profile；SalesNav 权限需现场核验。普通 LinkedIn 另依赖已有 Hunter launcher。开发版源码可调用，包内有 CLI 名称不表示已在用户机器安装，也不表示已发布。安装说明见 [INSTALL.md](INSTALL.md)。本轮文档修改不执行安装或真实搜索。

### 结果怎么看

| 展示或状态 | 正确含义 | 不能据此推断 |
|---|---|---|
| 未评估 | 尚未作模型判断 | 不等于不符合或证据不足 |
| 证据不足 | 已评估，但证据不足以判断条件 | 不等于现实中不具备该条件 |
| 符合 / 不符合 | 模型按本次条件和证据作出的判断 | 不等于平台认证 |
| 操作 completed | 某次工具调用已返回 | 不等于业务目标完成、资料齐全 |
| 任务 completed | 数量目标达到且没有阻止完成的未解决操作 | 不保证搜遍全部结果或市场 |
| partial / 游标仍存在 | 本次读取或任务尚有未完成范围 | 不把当前页当全量 |
| blocked / unknown | 已阻塞，或派发结果未知 | 不能简单换操作ID再跑 |

例如“平台80条、已读3条、详情1条、符合0条、证据不足1条、未评估2条”是不同统计口径，必须同时说明；这里是既有验收样本的口径，不是用户每次任务的预设结果。

<a id="agent-contract"></a>
## Agent 执行契约

1. 恢复已有需求和授权；确认目标是候选数量还是符合数量。把业务条件写入task，不固化到工具或Skill默认规则。
2. 对多步任务先T02，恢复任务先T08。账号绑定以实际Profile和站内身份为准；Chrome Profile名称不等于LinkedIn身份。
3. 先检查能力，再按需P06解析平台选项。P05/P06用界面字段名，搜索filters用参数key；不要猜平台ID或把公司名称当已验证筛选值。
4. 请求统一走T07保存账本。每轮读回条件、总数、已读、新增、游标和停止原因；模型再决定续读、收窄、拆分或停止，不固定“多少条必须抓完”。
5. 只用详情/来源支持业务判断。T09保存模型结论，T11输出用户表格。结构校验不替代证据语义检查。
6. 遵守单轮/累计预算。重放、续读、重新查询是不同动作；详情批次可用P14，同批已知动作才组合，不预猜依赖上一步的新参数。

| 操作类型 | 副作用与前置条件 | 失败/重复调用处理 |
|---|---|---|
| P03–P14 平台读取 | 会连接账号、导航页面；当前支持范围不发送消息/邀请/保存名单 | 身份、验证码、权限限制停止依赖操作；不换渠道规避 |
| T02/T03/T04 创建任务 | 写本地新目录/定义；输入文件和账本目录分离 | 已存在的任务不覆盖；恢复使用T08 |
| T07 执行 | 写派发/回执，再运行平台动作；账号固定 | 同ID同请求返回原回执；变更请求不可复用ID；缺回执保留unknown |
| T09/T10 评估/处理记录 | 本地追加有版本的记录 | 使用新版本ID；T10只允许成功替代局部参数错误 |
| T11/P15 导出 | 写本地文件；目标路径不能覆盖已有文件 | 使用新report_id/路径；报告失败检查实际文件，不盲目重复 |

### 最小调用示例（给 Agent / CLI 使用者）

以下为**模板，不是真实账号或已执行结果**。将 `/ABS/PROJECT` 替换为真实授权项目路径，账号字段替换为已核验身份；请求文件放 `inputs/`，任务数据另放 `.local/runs/`。以下命令从包根目录执行。文件中只能保存对应 JSON 对象，不能把示例标题一同复制。

**1. `inputs/create.json`：创建公司任务。**

```json
{
  "directory": "/ABS/PROJECT/.local/runs/demo",
  "task": {
    "task_id": "demo",
    "intent": "company_discovery",
    "criteria": [{"description": "提供用户指定的产品或服务", "strength": "required"}],
    "target": {"count": 1, "meaning": "qualified"},
    "budgets": {"max_operations": 5},
    "evidence_scope": "本次任务实际读取的页面；未读内容不作结论"
  }
}
```

```sh
node src/linkedin-cli.mjs task-create inputs/create.json
```

**2. `inputs/account.json`：账号核验请求。**

```json
{
  "directory": "/ABS/PROJECT/.local/runs/demo",
  "task_id": "demo",
  "operation_id": "account-1",
  "request": {
    "provider": "salesnav",
    "operation": "account.inspect",
    "account": {
      "profile": "PROFILE_ID",
      "expected_identity": "EXACT ACCOUNT NAME",
      "expected_profile_url": "https://www.linkedin.com/in/SELF/"
    },
    "input": {}
  }
}
```

```sh
node src/linkedin-cli.mjs task-execute inputs/account.json
```

核验通过后，另建搜索请求文件：沿用相同任务与account，operation_id换为`search-1`，operation换为`company.search`，input使用`{"keywords":"用户选定关键词","filters":{},"limit":5,"max_pages":1,"request_budget":120}`。加入动态筛选时先P06解析，不把示例关键词当默认搜索。

**3. 执行后的分支与交付输入。**

| 动作 | 请求文件所需内容 | CLI |
|---|---|---|
| 查看进度 | `{"directory":"/ABS/PROJECT/.local/runs/demo","task_id":"demo"}` | `task-status inputs/status.json` |
| 继续读取 | 新operation_id，request取回执resume对象；必要时补limit/max_pages | `task-execute inputs/next.json` |
| 补公司详情 | 新operation_id，request.operation=`company.read`，input.company来自真实结果 | `task-execute inputs/detail.json` |
| 保存判断 | directory/task_id/assessment_id及assessments；实体key来自task-status | `task-assess inputs/assessment.json` |
| 输出表格 | `{"directory":"/ABS/PROJECT/.local/runs/demo","task_id":"demo","assessment_id":"review-1","report_id":"report-1"}` | `task-report inputs/report.json` |

表中CLI均加前缀`node src/linkedin-cli.mjs`。不能只创建报告输入就跳过评估保存。qualified评估模板：`{"key":"实际实体key","status":"qualified","reason":"模型判断理由","evidence":[{"criterion_index":0,"operation_id":"实际观察此实体的操作ID","source":"实际来源URL","explanation":"证据如何支持条件"}]}`；外层为`{directory,task_id,assessment_id,assessments:[...]}`。证据不足用insufficient_evidence；未评估不要伪造判断条目。

### 两种容易混淆的请求

- `plan`/`execute`的文件只放上例 **request内部对象**。plan验证路由/编译参数，不保证所有SN字段值有效，真实选项和生效条件仍需适配器验证。
- `task-execute`的文件放**完整外层对象**。只有它提供任务账本、幂等回执和自动上下文选择。`resume`是下一次request，不是完整task-execute输入；游标有有效期，不能永久续读。
- CLI外层`ok:true`不代表data.status一定成功。检查`data.status`、`error`、`coverage`与`resume`后再决定下一步。

## 调用方式和公共输入

统一CLI：`cskh-linkedin <command> request.json`，工作区等价 `node src/linkedin-cli.mjs <command> request.json`。平台功能推荐通过task-execute的request调用，request包含provider/operation/account/input；plan和execute直接接收request，不能传task-execute外层包装。

SN直连：`cskh-linkedin-salesnav <command> '<JSON>'`，工作区等价 `node src/cli.mjs <command> '<JSON>'`。capabilities不带参数读取静态目录，带账号和search_type读取真实页面能力。命令名称表示包内bin定义，不表示当前机器全局已安装。

账号绑定：profile、expected_identity、expected_profile_url。SN请求可带request_budget和execution_context；前者是本地调用预算，不是订阅余额。普通LinkedIn需要HUNTER_OPENCLI_ENTRY指向外部已安装launcher。

<a id="platform-catalog"></a>
## 一、平台与本地读取/导出能力

| 编号 | 能力 | 操作标识 → 实际CLI | 输入 | 输出 | 当前证据/边界 |
|---|---|---|---|---|---|
| P01 | 环境连接诊断 | doctor（SN直连） | 可选 profile | Node/OpenCLI版本、已连接Profile、下一步；不证明账号权限 | 已实现；受执行环境影响 |
| P02 | 读取本地能力目录 | capabilities（统一/SN，无参数） | 无 | 操作路由；SN另返回全部筛选字段定义 | 本轮实际读取通过；不是账号授权 |
| P03 | 核验SalesNav账号与权限 | salesnav · account.inspect → account-check | 账号绑定 | 身份、自有主页、搜索权限、订阅/余额可见证据、短期执行上下文 | 真实样本通过；未知余额不补值 |
| P04 | 核验普通LinkedIn账号 | linkedin · account.inspect → linkedin whoami | 账号绑定 | 登录状态、姓名、public_id核验结果 | 已有本人账号样本；本轮未重测 |
| P05 | 读取页面筛选能力 | salesnav · capabilities.list → capabilities | 账号绑定 + search_type | 当前页面可见字段、适配/限制状态 | 已实现；可见字段不是平台全量承诺 |
| P06 | 解析筛选候选值 | salesnav · filters.resolve → filter-options | search_type、field界面名称、动态字段query | 真实候选标签、包含/排除模式；区间/布尔/文本控件信息 | Current company真实样本通过；非所有字段全测 |
| P07 | 搜索公司 | salesnav · company.search → account-search | keywords、filters、limit、max_pages | 公司ID/名称/链接、请求与生效条件、结果总数、覆盖和游标 | 真实样本通过 |
| P08 | 搜索人员（SalesNav） | salesnav · person.search → lead-search | keywords、filters、limit、max_pages | 人员ID/名称/链接、条件读回、总数、覆盖和游标 | 当前公司筛选真实通过；80条中仅读3条 |
| P09 | 搜索人员（普通LinkedIn） | linkedin · person.search → hunter-linkedin scout | keyword必填；location/connection/currentCompany/pastCompany/school/industry/language/limit | 标准化人员结果、原始响应、上游提供的覆盖信息 | 已接入；完整真实搜索待验 |
| P10 | 续读搜索结果 | salesnav · search.next → search-page | 原账号/查询绑定cursor；limit、max_pages | 累计结果、新增数、页进度、后续游标或停止原因 | 公司续读3→5真实通过；人员续读本轮未测 |
| P11 | 读取公司详情 | salesnav · company.read → account-read | company：公司ID或支持的公司链接 | 名称、行业、地区、人数原文、收入原文、网站、About、字段来源/缺失 | 真实样本通过；限已定义栏目 |
| P12 | 读取人员详情（SalesNav） | salesnav · person.read → lead-read | lead：完整受支持SalesNav人员链接或路由token | 姓名、headline、地区、About、current_roles及缺失状态 | 单数/复数任职布局已适配；单数布局真实复验通过 |
| P13 | 读取人员详情（普通LinkedIn） | linkedin · person.read → linkedin profile-read | profile_url：公开个人主页 | 统一results、原始行/响应、资料完整性 | 已有本人主页样本；缺资料时partial |
| P14 | 受控批量执行 | salesnav · operations.batch → batch | operations数组（1–50项），各command/input | 逐步回执、重复公司详情复用、异常停止位置 | 已实现/有测试；本轮未真实重测；属于组合执行 |
| P15 | 导出已有结果文件 | export（SN直连） | input_path、output_path、format | 本地HTML/CSV/Markdown/JSON及路径/数量 | 已实现；不给最终用户默认展示JSON |

## 二、任务支撑能力

下列均为统一CLI命令。结构/恢复行为有回归测试；公司及人员链路已有小样本，不能外推所有组合。

| 编号 | 能力 | CLI | 输入 | 输出 |
|---|---|---|---|---|
| T01 | 校验任务定义 | task-validate | task_id、intent、criteria、target | 结构校验结果；不判断目标合理性 |
| T02 | 创建持久任务 | task-create | directory、task | 任务定义、指纹和created状态 |
| T03 | 导入已确认招聘需求 | task-import-sourcing | directory、confirmed=true、sourcing_request、task、可选mapping_note | 保留原需求和模型映射的人员任务；不自动理解画像 |
| T04 | 公司转人员子任务 | task-company-people | parent、company_keys、directory、新task | 来源公司观察、父任务版本、people_discovery子任务；不自动搜索 |
| T05 | 编译操作计划 | plan | provider、operation、account、input（直接请求对象） | 可执行程序和参数、planned/dispatched=false；不连接浏览器 |
| T06 | 单次执行并标准化 | execute | 直接请求对象，同plan | status/data/error/coverage/resume；不写任务账本 |
| T07 | 执行并持久化操作 | task-execute | directory、task_id、operation_id、request | 派发记录、实际参数、回执；同ID同请求重放 |
| T08 | 读取进度/恢复任务 | task-status | directory、task_id | 任务、操作、去重实体/观察、覆盖/游标、最新报告状态 |
| T09 | 保存模型评估 | task-assess | 任务定位、assessment_id、assessments | 带版本的判断记录；校验硬条件证据关联，不替模型判断真假 |
| T10 | 关联局部失败的替代结果 | task-resolve | 任务定位、operation_id、replacement_id、reason | 保留原失败并关联成功替代；不能解除权限/未知结果 |
| T11 | 生成用户交付表格 | task-report | 任务定位、assessment_id、report_id | HTML+CSV、候选/符合数量、completed或partial；不代表搜完市场 |

<a id="outreach-catalog"></a>
## 既有 Reach / Outreach 能力（外部项目，尚未接入统一网关）

**更正范围**：此前“发送、邀请未接入”仅指新统一网关，不能解释为整个LinkedIn产品没有这些功能。以下已核对旧Hunter源码、Skill和部分CLI help；当前账号实际可用性、安装状态及真实发送未在本次验证。

来源是旧Hunter项目的`skills/cskh-outreach`、`packages/hunter-linkedin`及其锁定OpenCLI运行时。命令前缀为`node <Hunter仓库>/scripts/opencli.mjs`，不是本包`cskh-linkedin`。所有R项当前均**未映射到本包gateway.operations**，不要发明`person.reach`或`message.send`作为已支持操作。旧Skill是招聘场景，要求已确认JD/JBF与finalShortlist；公司研究名单不能直接当最终招聘名单。

| 编号 | 原子能力 | 真实入口（省略上述前缀） | 关键输入 | 输出 | 副作用/执行边界 |
|---|---|---|---|---|---|
| R01 | 探测对某人的触达能力 | `hunter-linkedin capability-probe` | 精确profileUrl、expectedName | Connect/Message入口、待处理邀请、InMail可见性等页面证据 | 读取页面；可见InMail不代表可发送；底层另有salesnav-message，未接入此触达流程 |
| R02 | 读取已有连接 | `linkedin connections` | limit，最多500 | 连接姓名、职业、主页标识、连接时间 | 私有关系读取，遵守既有候选人门 |
| R03 | 读取已发邀请 | `linkedin sent-invitations` | 无业务参数 | 收件人主页、邀请日期 | 私有关系读取；用于Pending回查 |
| R04 | 读取会话列表 | `linkedin inbox` | limit 1–100、unread-only | 线程URL、姓名、末条摘要、未读状态 | 私有会话读取；同名不能证明同一人 |
| R05 | 读取精确会话快照 | `hunter-linkedin thread-snapshot` | threadUrl、expectedName、maxScrolls 0–80 | 可见消息、收件人、最新文本、快照 | 只读；消息范围为可见/已加载范围 |
| R06 | 归并关系状态 | `hunter-linkedin relationship-state` | 关系证据input文件、可选output | 精确主页关联的关系状态和证据 | 本地写文件；不凭同名自动关联 |
| R07 | 生成渠道计划 | `hunter-linkedin outreach-plan` | 候选人、关系状态、已验证联系方式文件 | primaryChannel、计划文件、executionAllowed=false | 确定性渠道路由；**不生成话术、不发送** |
| R08 | 检查重复/未决触达 | `hunter-linkedin outreach-ledger --action check` | 触达意图input、可选ledger/output | 是否重复成功、是否已有未决尝试等 | 本地台账检查，不是发送授权 |
| R09 | 记录触达回执 | `hunter-linkedin outreach-ledger --action record` | 实际执行结果、审批/平台证据、台账路径 | 台账记录 | 本地写入；不能用伪造成功补记 |
| R10 | 准备/发送连接邀请 | `hunter-linkedin connect-safe` | profileUrl、expectedName、note≤200字符、send、approval | 收件人核验、演练或执行结果 | 默认send=false；打开邀请弹窗不等于无页面影响；真发需当前有效审批及准备确认 |
| R11 | 准备/发送首条消息 | `hunter-linkedin first-message-safe` | profileUrl、expectedName、message、send、approval | 草稿/执行回执 | 默认只填草稿；草稿也改变页面状态；审批后才发送 |
| R12 | 准备/发送已有线程消息 | `linkedin safe-send` | thread-url、expected-name、message、expected-last-text/hash、send | 线程/收件人/最新内容核验和执行结果 | 默认send=false；安全执行器负责逐条审批与最新消息哈希，不裸调绕过审批 |
| R13 | 导出邮件草稿 | `node <outreach Skill>/scripts/create-email-draft.mjs` | 候选人、已验证邮箱、主题/正文等input、output-dir | email-draft.json/md，draft_ready | 仅本地文件；不发送、不写入邮箱草稿箱、不猜邮箱 |

### 触达组合入口（不是新的平台原子命令）

| 编号 | 入口 | 输入 → 输出 | 当前归属 |
|---|---|---|---|
| O01 | `collect-outreach-context.mjs` | 已批准候选人input → 串行收集关系证据、状态、计划、防重检查；executionAllowed=false | 外部cskh-outreach/scripts |
| O02 | `execute-approved-outreach.mjs` | 有效逐条审批、内容、候选人、渠道和关系快照 → 核验/单次执行/回查/台账 | 外部cskh-outreach/scripts；有外部写入，不能当只读检查运行 |
| O03 | `summarize-outreach-batch.mjs` | 批次记录 → outreach-summary.json/md | 仅汇总；advisoryOnly=true，不自动发送 |

上述脚本都接收input.json及`--output-dir`，完整字段以旧Skill的`references/outreach-contract.md`为准；不要把本包TaskRequest直接传入。**个性化话术是模型业务能力**，需要已确认岗位事实与候选人证据；R07仅选择渠道，这两者不能混写。

### 与新统一 Skill 如何衔接

现状：搜索/评估由本包组织，触达仍走外部`cskh-outreach`。尚无自动交接实现。未来交接需显式输出确认后的finalShortlist与来源证据，保留JD/JBF及候选人门/执行门；目标公司或初步搜索结果不直接进入发送。

旧Skill要求逐人允许进入触达，发送前逐条确认完整对象/渠道/内容；审批与Connect准备记录有15分钟有效期，关系或内容变化重新确认，结果uncertain不自动重发。盘点能力、读help和开发文档不构成读取私有会话或真实触达授权。原Skill源码当前保留，本文没有新增或降低这些规则。

维护触达时修改旧项目相应模块；在未获跨项目修改授权前，可在本项目形成候选补丁，但不能把目录清单更新声称已完成运行时接入。新增统一写操作需单独定义账号绑定、审批、幂等、结果未知与回查契约，不能只在路由表加一个名字。

## 三、内置机制（没有独立CLI）

| 机制 | 输入 | 输出 | 入口/边界 |
|---|---|---|---|
| 账号隔离/互斥 | 账号绑定、Profile | 拒绝账号覆盖/串用；同Profile锁 | task-execute / 平台执行内部 |
| 短期上下文复用 | 最新有效回执 | 自动注入上下文；连接/身份仍重核 | task-execute；跨进程仍有身份页面 |
| 会话生命周期 | 本次执行会话 | 单会话导航及临时会话清理回执 | SN CLI内部；不是永久复用用户标签页 |
| 精确去重 | 累计实体ID/公开URL | 同实体合并观察 | task-status；不同平台不凭姓名模糊合并 |
| 预算/未知结果防重跑 | 操作账本、操作ID、预算 | 重放/拒绝/保留未知 | task-execute；不能保证外部平台恰好一次 |
| 条件读回/覆盖记录 | 请求条件、页面状态 | 实际生效条件、总数、截断/游标 | 搜索内部；人数不等于真实工资册 |

## 四、模型业务判断（不是平台CLI能力）

| 判断 | 输入 | 输出 |
|---|---|---|
| 理解需求 | 用户目标、已有约束 | 任务条件/数量/完成标准 |
| 制定检索策略 | 任务、可用字段/选项、已读数量 | 平台选择、搜索条件、续读/拆分/停止决策 |
| 评估证据 | 公司/人员事实与来源 | 符合/不符合/证据不足及理由；未评估单列 |
| 公司到人员选取 | 公司结果、角色需求 | 选定公司与新的人员条件 |
| 解释交付 | 任务目标、观察和评估 | 可读结论、缺口与建议 |

这些判断可通过task-create/task-assess等记录，工具不把行业、地区、团队人数等业务规则写死。

## 五、SalesNav筛选参数全表

以下逐项来自当前FIELD_SCHEMAS实际运行输出。列出定义不等于逐项真实验收通过；restricted表示当前适配明确限制，不能绕过。动态字段值必须先filters.resolve；包含/排除以实际返回选项为准。

### 公司搜索：15个字段

| 参数key | 平台名称 | 输入类型 | 模式 | 状态 |
|---|---|---|---|---|
| industry | Industry | entity | include,exclude | 已定义；逐项实测未在本表认定 |
| headquarters_location | Headquarters location | entity | include,exclude | 已定义；逐项实测未在本表认定 |
| company_headcount | Company headcount | enum | include | 已定义；逐项实测未在本表认定 |
| number_of_followers | Number of followers | enum | include | 已定义；逐项实测未在本表认定 |
| fortune | Fortune | enum | include | 已定义；逐项实测未在本表认定 |
| job_opportunities | Job opportunities | enum | include | 已定义；逐项实测未在本表认定 |
| recent_activities | Recent activities | enum | include | 已定义；逐项实测未在本表认定 |
| connection | Connection | enum | include | 已定义；逐项实测未在本表认定 |
| saved_accounts | Saved accounts | enum | include | 已定义；逐项实测未在本表认定 |
| account_lists | Account lists | enum | include,exclude | 已定义；逐项实测未在本表认定 |
| annual_revenue | Annual revenue | range |  | 已定义；逐项实测未在本表认定 |
| company_headcount_growth | Company headcount growth | range |  | 已定义；逐项实测未在本表认定 |
| department_headcount | Department headcount | range |  | 已定义；逐项实测未在本表认定 |
| department_headcount_growth | Department headcount growth | range |  | 已定义；逐项实测未在本表认定 |
| companies_in_crm | Companies in CRM | restricted |  | restricted_in_validated_account |

### 人员搜索：33个字段

| 参数key | 平台名称 | 输入类型 | 模式 | 状态 |
|---|---|---|---|---|
| geography | Geography | entity | include,exclude | 已定义；逐项实测未在本表认定 |
| current_company | Current company | entity | include,exclude | 已定义；逐项实测未在本表认定 |
| function | Function | enum | include,exclude | 已定义；逐项实测未在本表认定 |
| title | Current job title | entity | include,exclude | 已定义；逐项实测未在本表认定 |
| seniority | Seniority level | enum | include,exclude | 已定义；逐项实测未在本表认定 |
| company_headcount | Company headcount | enum | include | 已定义；逐项实测未在本表认定 |
| past_company | Past company | entity | include,exclude | 已定义；逐项实测未在本表认定 |
| company_type | Company type | enum | include | 已定义；逐项实测未在本表认定 |
| company_headquarters_location | Company headquarters location | entity | include,exclude | 已定义；逐项实测未在本表认定 |
| past_title | Past job title | entity | include | 已定义；逐项实测未在本表认定 |
| years_in_current_company | Years in current company | enum | include | 已定义；逐项实测未在本表认定 |
| years_in_current_position | Years in current position | enum | include | 已定义；逐项实测未在本表认定 |
| industry | Industry | entity | include,exclude | 已定义；逐项实测未在本表认定 |
| profile_language | Profile language | enum | include | 已定义；逐项实测未在本表认定 |
| years_of_experience | Years of experience | enum | include | 已定义；逐项实测未在本表认定 |
| groups | Groups | entity | include | 已定义；逐项实测未在本表认定 |
| school | School | entity | include | 已定义；逐项实测未在本表认定 |
| connection | Connection | enum | include | 已定义；逐项实测未在本表认定 |
| connections_of | Connections of | entity | include | 已定义；逐项实测未在本表认定 |
| persona | Persona | enum | include | 已定义；逐项实测未在本表认定 |
| account_lists | Account lists | enum | include,exclude | 已定义；逐项实测未在本表认定 |
| lead_lists | Lead lists | enum | include,exclude | 已定义；逐项实测未在本表认定 |
| people_interacted_with | People you interacted with | enum | include,exclude | 已定义；逐项实测未在本表认定 |
| saved_leads_and_accounts | Saved leads and accounts | enum | include,exclude | 已定义；逐项实测未在本表认定 |
| following_your_company | Following your company | boolean |  | 已定义；逐项实测未在本表认定 |
| viewed_your_profile_recently | Viewed your profile recently | boolean |  | 已定义；逐项实测未在本表认定 |
| past_colleague | Past colleague | boolean |  | 已定义；逐项实测未在本表认定 |
| shared_experiences | Shared experiences | boolean |  | 已定义；逐项实测未在本表认定 |
| changed_jobs | Changed jobs | boolean |  | 已定义；逐项实测未在本表认定 |
| posted_on_linkedin | Posted on LinkedIn | boolean |  | 已定义；逐项实测未在本表认定 |
| first_name | First name | text |  | 已定义；逐项实测未在本表认定 |
| last_name | Last name | text |  | 已定义；逐项实测未在本表认定 |
| people_in_crm | People in CRM | restricted |  | restricted_in_validated_account |

共同参数：keywords（原样交平台解释的文本/布尔搜索串）、filters、limit（1–2500）、max_pages（1–10）；达到限制返回部分结果，不自动视为目标完成。entity/enum通常用[{label,mode}]，range用{min?,max?,currency或department}，text用字符串，boolean用布尔值。普通LinkedIn人员搜索参数见P09，不能与SN字段名混用。

## 六、尚未接入/不能宣称的能力

新统一网关未接入发送消息、InMail发送、加好友、保存名单等写操作；旧项目已有Connect、首条/已有会话消息能力，见R10–R12，不能据此宣称这些功能全局不存在；Recruiter和X-Ray未接入统一网关；模糊跨平台身份合并未实现；PDF不是当前CLI原子命令；平台余额未显示时只能unknown。SalesNav公司到人员小样本已达标；普通LinkedIn搜索本轮被上游linkedin_sales_pitch误判阻塞；正常页面与候选已观察到，外部适配器补丁待应用。旧外部招聘Skill未被自动替换。安装/构建脚本是交付运维工具，不属于LinkedIn业务操作。

<a id="skill-maintenance"></a>
## Skill 更新地图（维护 Agent 入口）

本文记录“可调用什么、如何调用及已验证边界”，Skill记录“何时选择、如何组合、如何判断”。参数值变化只改任务；平台能力变化才改适配器。不要把本表全文复制到每个Skill形成多份易漂移清单。

| 变化/能力 | Skill维护位置（相对包根） | 代码真源 | 验证重点 |
|---|---|---|---|
| 任务恢复、跨平台路由、公司转人员 T01–T11 | `skills/cskh-linkedin/SKILL.md` | `src/linkedin/gateway.mjs`、`task-store.mjs` | `test/linkedin-gateway.test.mjs`、`test/linkedin-task-store.test.mjs`；来源和终态不丢失 |
| SN筛选/续读/详情 P03/P05–P08/P10–P12/P14 | `skills/cskh-linkedin-salesnav/SKILL.md`，统一入口仅同步路由影响 | `src/fields.mjs`及合并schema、`search.mjs`、`pagination.mjs`、`account-read.mjs`、`lead-read.mjs`、`batch.mjs` | 对应测试 + 受影响字段真实样本；不能用目录存在代替实测 |
| 普通LI账号/搜人/详情 P04/P09/P13 | `skills/cskh-linkedin/SKILL.md` | `src/linkedin/gateway.mjs`及外部launcher实际契约 | 身份核验、参数保真、真实响应形态；外部项目另按授权维护 |
| 旧招聘需求转交 T03 | `skills/cskh-sourcing-linkedin/SKILL.md` | `importSourcing`、安装器 | 原需求/确认保留；包内入口不等于外部已安装Skill被替换 |
| 报告与数据解释 T09/T11/P15 | 统一Skill的评估/交付段落 | `src/linkedin/task-store.mjs`、`src/export.mjs` | 未评估/证据不足区分、证据关联、数量、输出路径 |
| 既有触达 R01–R13/O01–O03 | 外部Hunter `skills/cskh-outreach/SKILL.md`及references/outreach-contract.md | 外部packages/hunter-linkedin、锁定OpenCLI、触达scripts | 本次仅源码/help核对；未来需逐项读写边界、审批、防重与实测 |
| 账号/上下文/预算 P01/P03、内置机制 | 统一Skill及SN Skill的恢复/停止规则 | `src/account-check.mjs`、`execution-context.mjs`、`session-lifecycle.mjs`、`execution.mjs` | 不跳过身份、不复用失效上下文、不扩大授权、不无限重试 |

### 修改顺序与验收

1. **定位**：在本表按P/T编号确定受影响能力。核对当前代码、CLI、测试、验收记录；文本中的“已实现”不能替代运行证据。
2. **归因**：业务参数改任务；决策/停止策略改Skill；页面字段/执行逻辑改适配器；只有文档不清就改文档。实际页面未读到字段不直接推断人物不存在该经历。
3. **修改**：保持稳定编号与调用契约；破坏性输入输出变更必须写迁移方式。更新相关Skill链接和示例，保留旧回执，不把真实账号/个人资料放入共享示例。
4. **验证**：先运行对应行为测试；代码变更运行`npm test`。契约变更核对CLI及例子；平台适配变更另做受影响的有界真实验收。纯文档修改只校验示例/链接/清单，不无故重搜平台。
5. **记录**：写明版本、日期、环境、修改前后行为、测试、真实范围、遗留和回退依据。报告结论分别写“实现”“测试”“真实验收”“安装/发布”，不要用一个完成百分比替代。

新增能力时补齐：`稳定编号｜用户场景｜provider/operation/CLI｜前置条件｜必填/可选输入与类型｜输出/缺失语义｜副作用｜失败与恢复｜实现位置｜测试/真实证据｜受影响Skill`。没有独立命令的机制必须标明“内置”；模型决策不得伪装成确定平台事实。

### 当前维护优先级（不是本次文档修改的开发承诺）

| 优先级 | 能力缺口 | 下一项证据 | 完成标准 |
|---|---|---|---|
| 已修复 | P12当前任职单数布局漏读 | 正式入口读到公司/职位/任期 | 回归与原样本复验通过；不外推全部页面布局 |
| 1 | P09普通LI搜索真实阻塞 | 上游success:false / linkedin_sales_pitch | 误判已定位到内联推广条幅；候选补丁待外部项目应用和正式复验 |
| 3 | 全字段定义不等于全字段验证 | 按字段/账号记录的验证矩阵 | 成功/受限/未验分别记录，不把48字段一概称已支持实测 |
| 4 | 开发版尚未正式发布 | 固定来源包、隔离安装及发布回执 | 安装/发布分别有证据；不擅自全局更新 |

## 核对来源

- src/linkedin/gateway.mjs：全部统一平台路由和普通LinkedIn参数白名单。
- src/linkedin-cli.mjs、src/linkedin/task-store.mjs：任务命令与输入输出。
- src/cli.mjs、src/fields.mjs及其合并schema：SN命令/筛选全集。
- src/doctor.mjs、src/export.mjs、src/batch.mjs：诊断、导出与批次边界。
- workflow-runs/linkedin-integration/task.md及本地acceptance-company-flow、acceptance-context-reuse、acceptance-people-flow验收记录：真实样本边界。

本表只记录核对后的当前状态；未重新发起平台搜索或读取个人资料。

维护记录：2026-10-24，将能力清单扩展为用户场景导航、Agent执行契约、可复制请求模板、Skill更新地图与验证规则。保留P01–P15、T01–T11及全部48个筛选定义；本次未改变执行代码、未新做平台验收或发布。

最新实现补充：coverage.mode支持target_only（默认）/all_observed_queries；后者要求已观察查询全部完整。budgets支持max_operations/max_pages/max_detail_reads/max_elapsed_seconds；页数、详情量为派发前保守预留，失败不返还，重放不消耗；时间从任务创建计，超时结果不自动重跑。普通LI无可靠分页预算，带max_pages会拒绝执行。报告已有业务列和完整分类计数。

补充记录：2026-10-24，纠正原总表只覆盖新网关的范围遗漏，补录13项既有触达原子能力、3项组合入口；均注明外部来源、未接入状态、副作用和验证边界。本轮未读取私有会话、未邀请或发消息。普通搜索最新诊断已确认是内联SalesNav推广条幅触发上游误判，外部scout修复待完成，不再将该回执直接解释为真实平台限制。

全局审计更正（2026-10-24）：底层已注册salesnav-message（InMail）、Recruiter等外部能力存在；此前“未接入”均限定新网关。完整命令差集、独立脚本与语义冲突见LINKEDIN_GLOBAL_AUDIT.md。

## 账号权益知识

账号分类、套餐差异、平台余额与本地预算的区分、执行选择及维护要求见 [账号权益与执行选择](../skills/cskh-linkedin/references/account-entitlements.md)。这是知识基线，不代表当前账号全部权限已核实。
