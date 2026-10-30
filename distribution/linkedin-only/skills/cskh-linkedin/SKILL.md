---
name: cskh-linkedin
description: 统一编排普通 LinkedIn 与 Sales Navigator 的公司和人员搜索、详情与账号核验。由模型按需求组合原子能力、选择平台、评估证据；确定性 CLI 执行操作并返回覆盖和恢复信息。
---

# LinkedIn 统一入口

先按 [能力发现与自由编排](references/capability-use.md) 选择独立操作或任务编排。以下任务流程适用于需要记录和恢复的多步任务，不是单个操作的强制前置。

从此 Skill 目录运行 `node scripts/opencli.mjs hunter-linkedin capabilities -f json`。命令输入使用本地 JSON 文件，详细契约见 ../../docs/LINKEDIN_GATEWAY.md。

1. 恢复用户已经确认的需求，输出 task_id、intent、criteria（required/preferred）、target（count、candidates/qualified），保存任务文件并运行 task-validate。行业、国家、人数、估算依据都是任务数据，不能固化规则。已有确认的 SourcingRequest 保留原文作为任务附件，模型逐项映射并记录；不强制重复 Align。
2. 模型基于平台能力提出 provider、operation、account、input。用 plan 验证，不发生浏览器操作。没有支持的字段不静默删除；不将未知权限当未订阅。公司高级筛选优先评估 SalesNav，人员任务按实际需要选择。
3. execute 执行。必须明确 Profile、站内完整姓名及个人主页 URL。普通 LinkedIn 的运行时绑定由产品入口自动完成，Agent 不设置内部入口环境变量。每次普通调用先核验身份，暂不缓存；SalesNav 复用原执行上下文和批处理机制。
4. 工具 completed 仅表示操作返回，不表示任务达标。业务判断由模型分别保存 evidence、assessment、gap；unknown 不能计为符合。估算须有依据，平台关联人数不是实际工资册人数。
5. 逐查询记录条件、总数原文、读取覆盖、去重数、游标和停止原因。依据结果数量和证据决定续页、拆分或补证；达到单批上限不是任务完成。恢复使用原 provider/account/cursor，不跨平台转译游标。
6. 账号/验证/限流/未知派发故障停止依赖操作；局部选项错误挂起该项。不得自动跨渠道绕过限制。普通入口共享 SalesNav profile 锁，但绕过统一入口的旧普通 CLI 不受此锁约束，禁止并发使用。
7. 最终交付人可读 HTML 表格和 CSV，机器 JSON 仅供追溯。复用 SalesNav export，保持来源时间、判断理由、具体缺口、实际/目标数量及剩余范围。PDF 为独立步骤。

旧 cskh-linkedin-salesnav 入口保留。招聘兼容入口使用此统一流程；Recruiter、X-Ray 暂不接入执行网关，不宣称已覆盖。安装、真实跨路由端到端验收与发布分别记录。禁止发送消息、邀请或保存名单。

## 能力索引与维护入口

按用户需求选择能力、核对输入输出或更新本 Skill 时，先查 [能力使用与 Skill 维护手册](../../docs/ATOMIC_CAPABILITIES.md)。按稳定的 P/T 编号引用相关能力；参数定义以代码为准，验证范围以实际回执为准，不复制整张筛选表到本 Skill。

## 可选的任务记录与恢复流程

有多步或数量目标且需要持久记录与恢复时，优先以 task-create 保存任务（directory 指向授权项目的私有结果目录）。使用 task-execute 执行平台请求，每次稳定 operation_id 关联本轮计划。重复ID只能取回原回执；改变参数需新操作ID。未知派发结果先核对，不换ID绕过重跑保护。

task-status 恢复账本和实体观察；按覆盖决定下一步。用 task-assess 保存模型评估，qualified 必须逐硬条件提供关联该实体观察的 operation_id、来源和解释。新条件新任务，不沿用旧评估。最后 task-report 导出 HTML 和普通表格 CSV，核对实际/目标数量与报告内容。

全部流程均可用合成回执测试，但报告必须声明合成；不能据此声称真实平台已验收。当前仍需模型判断证据语义、额外覆盖条件和终止理由。

## 从公司继续找人

用户需要在公司名单中寻找角色时，选定父任务中的公司key，调用 task-company-people 创建关联的 people_discovery 子任务，保存公司观察及父任务版本。人员目标条件由本次需求决定，不照搬公司规模等条件。不把公司名称当成已验证平台筛选值；先解析并核对选项，再执行人员查询。汇报时按来源公司组织名单，不把“查询限定该公司”冒充已核实当前任职详情。

## 完成状态和局部失败

交付后 task-status 返回该报告状态；新资料或评估使旧交付失效，回到 in_progress。task-resolve 仅用于已用同平台同操作成功替代的局部参数失败，必须说明替代为何满足原意。原错误保留。未知派发、账号或平台限制不能关闭为成功，不更换操作ID绕过。

### 减少重复平台操作

任务入口会自动沿用同任务最新且有效的 SalesNav 账号上下文，底层仍核验身份和连接。筛选、搜索、详情首次隐式完整检查成功后，也会产出短期上下文供后续 task-execute 自动沿用；无需先额外调用 account.inspect。跨命令仍新核验连接和自身主页，不把诊断缓存描述为持续浏览器会话。无需每步手动先执行 account.inspect；账号切换、上下文失效或明确阻塞时按回执处理，不连续刷新重试。已知的一组公司/人员详情优先用受控 operations.batch；需要先观察结果才能决定的下一步保持分步执行。不要把浏览器会话复用与本地回执重放混为一谈。

报告必须区分“未评估”与“证据不足”：未读详情或尚未作模型判断时保持未评估，不人为补一个证据不足结论。两者都不计入达标数。

### 完成与预算契约

需要读完已观察查询时显式设置coverage.mode=all_observed_queries；只要求达标数量可用默认target_only，仍披露未读范围。不要把查询窗口完整称市场全量。budgets可用max_operations/max_pages/max_detail_reads/max_elapsed_seconds；页数与详情按请求保守预留，时间自创建计，重放不消耗，失败不返还。普通 LinkedIn 列表搜索支持任务页预算，执行请求须明确 max_pages；失败调用仍计入已预留预算；上游success:false即阻塞，linkedin_sales_pitch不能误称账号未订阅或通过其他渠道规避。

### 既有触达能力的范围说明

用户询问联系/Reach/Outreach时，说明外部Hunter已有cskh-outreach及关系、计划、台账、Connect和消息能力，见能力手册R01–R13/O01–O03；这些未接入当前网关，不要声称全局不存在，也不要把搜索结果自动转为发送。只在明确触达任务下读取相应Skill并恢复其输入/授权流程；查询能力本身不授权私有关系读取、草稿填写或发送。

### 全局能力盘点契约

当用户问整个LinkedIn的能力、遗漏或整合范围时，先读取[全局能力审计](../../docs/LINKEDIN_GLOBAL_AUDIT.md)及[命令输入输出索引](../../docs/reference/linkedin-command-inventory.json)。不得用本包gateway.operations代替全局清单。分别核对Skill编排、独立脚本、Hunter扩展、项目锁定OpenCLI与全局OpenCLI；每项分别标记来源、是否接入、验证证据与缺口。同名入口不假定语义相同，注册/help可见不等于账号可用。内部库不虚构为独立CLI，旧规则评分不得冒充模型判断。更新能力时维护旧入口到新入口映射；不因盘点而调用私有关系读取或发送操作。

### 账号权益：按需读取

普通 / Premium / SalesNav / RPS 分开；RPS 未开发。套餐权益≠当前权限≠余额≠本地预算；未知不填零，付费不代表发送获准。遇验证、限流或未知结果停止依赖动作。

只读取本次所需专题：搜索/资料读[搜索与读取](references/search-entitlements.md)；消息/额度读[消息与额度](references/messaging-entitlements.md)；套餐解释读[账号与套餐](references/account-plans.md)。字段诊断或维护见[索引](references/account-entitlements.md)，不要默认全部展开。同任务复用有效知识与账号检查；切换、过期、断线或权限变化再核验，保留执行器必要的身份检查。仅在知识过时、冲突、影响当前决策或用户要求最新时查询官方资料。

### 普通路径与方案检查

需要比较普通与 SalesNav 路径时，可用 `route-options` 对模型提出的候选请求和已有操作证据做本地检查，见 [输入输出契约](../../docs/LINKEDIN_ROUTE_OPTIONS.md)。它不自动采集权限或切换路径，eligible 不代替执行校验。普通入口新增 company.read、person.experience、person.projects；经历与项目归到同一人，不按段数增加候选数。当前仅合成验证，不声称真实账号已通过。

### 准备联系名单（不发送）

使用 `task-prepare-outreach` 将已评估符合的人员交给后续流程，输入输出见 [名单交接契约](../../docs/LINKEDIN_ROUTE_OPTIONS.md#名单交接task-prepare-outreach)。新资料加入后，先重评再交接；assessment_stale 不可通过复制或补填版本绕过。旧交接是历史快照，进入触达前重新核对资料版本。生成文件不等于候选人批准或发送批准；沿用 cskh-outreach 的授权要求，通用商务流程尚未接通。

旧 Outreach 每次接收一名 candidate。准备招聘联系时，可用 `task-outreach-input` 将交接名单的一人转为输入，必须提供真实已确认岗位资料；旧交接版本失效则重新评估/交接。输出仍待候选人批准，不生成 candidateApproval，不自动调用收件箱或发送。用前重新核对来源版本，具体字段见名单交接契约。

需要新读取账号检查时使用 `account-inspect`（account + candidates），按候选涉及的平台复用现有确定性检查；它只检查、不执行候选请求。普通路径只验证身份，不能因此声称搜索权限或套餐已确认；SN按实际回执保留权限与余额。blocked停止依赖操作，unknown先说明缺口，不以配置补齐。当前没有跨调用诊断缓存，已有有效证据时不反复调用。详见账号路径契约。

明确需要确认套餐或余额时，account-inspect 增加 include_subscription:true；只识别受支持的订阅区域，默认不开订阅页。续期原文不是额度重置日期；余额未显示时保持未知。已识别套餐仍不替代具体操作权限与用户授权。

### 搜索摘要与中断恢复

人员搜索保留 `fields.search_summary`（页面搜索卡片原文），可用于模型初筛；它不是结构化的当前任职证明，不能直接填入详情职位。历史回执缺少摘要时保持缺失，不编造。用 `task-recovery` 和原任务的 directory/task_id 读取已完成详情、待读名单和中断原因；此命令只生成本地清单、不派发浏览器操作。诊断完成前不自动重试，不因单人展开失败重读已经完成的人员。报告分别显示搜索覆盖、评估进度与操作中断；达到数量不等于无中断完成。

核实当前公司和岗位时，person.read 可传 `include_about:false`：保留身份及目标页面校验，读取已显示的当前任职；About标记not_requested，不假装读过完整简介。需要简介证据时使用默认完整读取。浏览器窗口故障不会因略去简介而自动解除账号或访问限制。

### 正式续跑与跨批次交付

`task-resume`：directory/task_id、operation_id、task-status返回的evidence_revision、person_keys（仅限task-recovery.pending）、可选include_about/request_budget。沿用原任务账号和预算，通过task-execute派发；版本变化、已经读取、未诊断中断均拒绝。不会创建新任务来重置预算，也不会自动清除故障；当前仅支持无未解决中断的人员待读队列。

`task-consolidate`：directory（输出目录）、report_id、sources数组，每项含directory/task_id/assessment_id。只读本地已保存的回执与评估，不调用平台；校验相同账号、意图、标准及评估版本，按实体去重，较新资料替代旧观察，缺评估不继承旧判断。输出HTML、CSV和来源版本清单；核对候选=符合+不符合+证据不足+未评估。人员评估完成不等于历史错误已解决，来源异常保留。旧报告是快照，新资料需重新评估并生成新报告。

## OpenCLI 统一入口

客户调用统一通过 `node scripts/opencli.mjs hunter-linkedin <command> --input input.json -f json` 调用；SalesNav命令加 `salesnav-` 前缀。先确认插件已安装并检查 `--help`；安装未完成时不得声称命令已可用。账号绑定仍来自输入文件，不能以全局Profile选项覆盖。安装与字段规则见 `../../docs/OPENCLI_PLUGIN.md`。内部 Node 入口仅供开发诊断，客户任务不要直接调用。

## 本机桥接假断连排查

受限执行环境的profile_not_connected或daemon停止提示不单独证明用户未连接。若本机桥接端口已有监听，先在获准访问本机服务的环境只读核对profile list/doctor，仍需明确Profile及本人身份；不要求用户重复连接、不重启正常服务、不切换账号。不要自动提权或绕过权限；宿主需授权时按其机制申请。详见[安装排错](../../docs/INSTALL.md#agent执行环境与假断连排查)。环境检查和真实搜索分别记录，失败不能当零匹配；已用完的搜索预算不自动重置。


## 安装后调用

从本 Skill 目录运行 `node scripts/opencli.mjs hunter-linkedin --help`，可查看全部命令。该入口使用产品自带的固定运行时；不要改用其他全局安装版本。Sales Navigator 需要当前账号实际具备权限，普通 LinkedIn 不需要订阅 Sales Navigator。

### 人员发现：默认列表覆盖至少 200 人

新建人员搜索/招聘寻访任务时，用户未指定列表读取量，默认计划跨查询累计读取至少 200 位去重人员的搜索列表资料。此数是列表覆盖下限，不是合格人数、详情读取量、平台每页数量或单次 CLI 的默认 limit；公司搜索和只核实用户提供的固定名单不适用。用户明确指定的列表范围优先，最终目标人数仍单独确认。

- 开始时说明“默认先覆盖至少 200 位去重候选人的列表资料，再按相关性选择详情核验”；创建任务时传入 `coverage: {mode: "target_only", min_unique_people: 200}`，在计划/进度表记录默认值来源；要求读完查询时保留 `all_observed_queries` 模式并同样设置该下限。不要写入人员匹配 criteria。工具按搜索列表的唯一人员统计并检查覆盖，详情单独读取不能补足列表覆盖。用户明确调整时记录实际值和来源。
- 每批显式传入 limit，按实际返回的游标续页；跨筛选组合按稳定人员 ID/规范主页链接去重，同一人重复出现不增加覆盖数。SalesNav search-page 的 limit 是累计目标，必须大于此前累计数；不要把 max_pages=1 当任务终点。
- 即使已提前找到目标数量的合格人选，也要完成约定列表覆盖再交付；覆盖 200 人后若合格人数未达目标，继续按结果与已确认预算调整策略。核对回执 `list_coverage` 的实际人数、缺口和 met；尚未满足覆盖要求时报告保持 partial。
- 结果耗尽、平台限制、用户停止或已确认预算不足时，可以不足 200 人，但必须报告实际数、差额、原因及未读范围，不能宣称覆盖已达标；不擅自放宽硬条件或重置预算。默认数量不是未确认的时间/调用预算授权。
- 仅需读取列表已展示的信息做初筛，不默认打开 200 份个人详情。报告分别列出列表去重人数、详情读取人数、已评估人数、合格人数及列表覆盖目标。

### 首次运行入口

安装后始终使用本 Skill 的 `scripts/opencli.mjs`。不要设置 `HUNTER_OPENCLI_ENTRY` 或 `OPENCLI_BIN`，不要改用全局 OpenCLI 或直接调用内部 Node 入口。遇到入口不一致先移除本次调用覆盖；同一错误不得靠更换 operation_id 重试。帮助命令通过仅证明命令存在，不代表账号检查或搜索成功。

### 普通列表续读

单查询、候选人数目标的任务，使用 `node scripts/opencli.mjs hunter-linkedin task-continue --input continue.json`。输入仅包含 directory、task_id、operation_id；同一次请求重试沿用 operation_id。程序选择最新进度并沿用原预算，不手动搬运游标。多查询返回 multiple_queries_require_selection；中断返回 diagnosis_required；预算耗尽停止。此能力不等于页级崩溃恢复，不能用新操作 ID 绕过中断。task-resume 仍用于补读详情。

### 批量详情读取

一次读取多人主页（≥10 人）用 `node scripts/opencli.mjs hunter-linkedin profile-read-batch --input batch.json`。输入 `profile_urls[]`，可选 `output`（结果目录）、`wait_seconds`（页面就绪硬上限，默认 8；就绪即返回）、`limit`。每人按锚点页读取：主页取 name/headline/location/about，经历走内置 `linkedin profile-experience`（`/details/experience/`），教育走 `hunter-linkedin profile-education`（`/details/education/`）。不要再自行滚动主页拼字段；单人教育经历用 `profile-education --profile-url`。单个浏览器会话内顺序导航，每人一条写入 `checkpoint.jsonl`；中断后用同一输出目录重跑即可跳过已读人员，并保留已有 `profiles.json`（按 profile_url 合并），不要更换目录或重复读取失败项。失败项记入检查点，`AUTH_REQUIRED`/验证类错误会立即停止整批，不重试。节奏默认 `--pacing steady`（25–45 秒间隔，每 6–10 人停顿 90–150 秒，每 25–30 人休息 5–8 分钟）；刚经历风控或账号受限时用 `conservative`（45–90 秒），不要用固定短间隔连发。搜索翻页间隔为 2–6 秒随机，不要改成连发。

### 匿名结果与分页策略

普通列表搜索按“结果卡”分类，不看整页文本（共同联系人里也可能出现 LinkedIn Member）。回执 `identity_summary` 的卡片计数只统计本次运行：`cards_inspected`（读取卡片）、`named_cards`（具名卡）、`visibility_limited_cards`（明确不可见）、`unresolved_cards`（未解析）；`collected_total` 是含游标历史、按 profileId 跨页去重后的已返回具名人数。`page_observations` 逐页记录同一口径。

- 具名候选人始终保留，不因同页出现匿名卡而丢弃整页结果。
- 未解析卡片（尚未加载完成或身份无法读取）不丢弃、不静默跳过，也不阻塞翻页：计入 `unresolved_cards`，本次结果标为 partial；只有整页都无可读卡片且没有下一页时才以 `profiles_unresolved` 停止并诊断。
- 已确认不可见身份（如 `LinkedIn Member`）默认 `anonymousPolicy=stop`：保留具名结果，`completeness=partial`，回执无游标，停止原因 `profile_identity_unavailable`。
- 只有用户已了解“将跳过无法识别者”并明确同意，才使用 `anonymousPolicy=continue`；该策略仅在有下一页时继续，末页仍有匿名卡时以 `visibility_limited_pagination_end` 结束，不能称为 complete。
- 匿名卡没有稳定身份，不得跨页去重，也不计入列表覆盖人数；覆盖只按具名 profileId/规范主页链接统计。
- `cursor` 只在确有下一页或本页仍有未读卡片时返回；`pagination_unavailable`、`no_new_people`、末尾匿名页结束时不返回游标，不要据旧游标重读同一页。
- `continue` 会跨匿名页继续翻页，直到达到用户设定的 max_pages/limit、检测到页面重复，或没有下一页；整页匿名本身不是停止理由。
- 页面卡片状态稳定后即返回，15 秒只是慢加载的硬上限；慢页的未解析卡会计入 `unresolved_cards` 并让结果保持 partial，但不会阻塞后续页；仍应报告未解析数量。
- 续读游标绑定筛选条件与该策略；改筛选或策略后沿用旧游标会被拒绝，CLI 实际返回 `search_cursor_query_mismatch`（游标 requestKey 已同时包含筛选与策略）。`cursor_policy_mismatch` 只在程序内直接传 previous 时出现，`cursor_query_mismatch` 对应查询指纹不一致；策略值非法返回 `invalid_anonymous_policy`。

## 故障处理

遇 task_busy，调用 `task-lock-inspect`，输入 directory、task_id。running 等待原任务；unknown 保留现场，不删锁；owner_exited 仅说明主进程已退出，不证明浏览器操作停止。不要自行把 execution_stopped_confirmed 填为 true。确认相关执行已停止后才可使用 task-lock-recover，必须传最新 revision；恢复不会重跑原操作。profile_busy 暂停并核对账号锁，不能清全局锁目录。

入口错误先检查安装回执与本次环境变量，不修改产品源码、不搜索旧运行时替代。缺少教育或证书能力时明确报告不支持，不使用来源未核实的用户级适配器。匿名结果不能直接归因于加载慢或账号限制；先保留页面与解析证据。

初始化分开报告：安装入口／离线命令／浏览器连接／本人身份／首次业务结果。help 和 capabilities 不能证明浏览器可用。已有有效检查不重复执行；真实搜索和详情读取沿用用户批准的范围。
