---
name: cskh-linkedin
description: 统一编排普通 LinkedIn 与 Sales Navigator 的公司和人员搜索、详情与账号核验。先形成明确任务定义，再由模型选择平台、评估证据；确定性 CLI 执行操作并返回覆盖和恢复信息。
---

# LinkedIn 统一入口

从此 Skill 目录运行 `node ../../src/linkedin-cli.mjs capabilities`。命令输入使用本地 JSON 文件，详细契约见 ../../docs/LINKEDIN_GATEWAY.md。

1. 恢复用户已经确认的需求，输出 task_id、intent、criteria（required/preferred）、target（count、candidates/qualified），保存任务文件并运行 task-validate。行业、国家、人数、估算依据都是任务数据，不能固化规则。已有确认的 SourcingRequest 保留原文作为任务附件，模型逐项映射并记录；不强制重复 Align。
2. 模型基于平台能力提出 provider、operation、account、input。用 plan 验证，不发生浏览器操作。没有支持的字段不静默删除；不将未知权限当未订阅。公司高级筛选优先评估 SalesNav，人员任务按实际需要选择。
3. execute 执行。必须明确 Profile、站内完整姓名及个人主页 URL。普通 LinkedIn 通过 HUNTER_OPENCLI_ENTRY 指向既有产品 launcher，不改变全局 OpenCLI。每次普通调用先核验身份，暂不缓存；SalesNav 复用原执行上下文和批处理机制。
4. 工具 completed 仅表示操作返回，不表示任务达标。业务判断由模型分别保存 evidence、assessment、gap；unknown 不能计为符合。估算须有依据，平台关联人数不是实际工资册人数。
5. 逐查询记录条件、总数原文、读取覆盖、去重数、游标和停止原因。依据结果数量和证据决定续页、拆分或补证；达到单批上限不是任务完成。恢复使用原 provider/account/cursor，不跨平台转译游标。
6. 账号/验证/限流/未知派发故障停止依赖操作；局部选项错误挂起该项。不得自动跨渠道绕过限制。普通入口共享 SalesNav profile 锁，但绕过统一入口的旧普通 CLI 不受此锁约束，禁止并发使用。
7. 最终交付人可读 HTML 表格和 CSV，机器 JSON 仅供追溯。复用 SalesNav export，保持来源时间、判断理由、具体缺口、实际/目标数量及剩余范围。PDF 为独立步骤。

旧 cskh-linkedin-salesnav 入口保留。招聘兼容入口使用此统一流程；Recruiter、X-Ray 暂不接入执行网关，不宣称已覆盖。安装、真实跨路由端到端验收与发布分别记录。禁止发送消息、邀请或保存名单。

## 能力索引与维护入口

按用户需求选择能力、核对输入输出或更新本 Skill 时，先查 [能力使用与 Skill 维护手册](../../docs/ATOMIC_CAPABILITIES.md)。按稳定的 P/T 编号引用相关能力；参数定义以代码为准，验证范围以实际回执为准，不复制整张筛选表到本 Skill。

## 必须使用的任务记录流程

有多步或数量目标时，先以 task-create 保存任务（directory 指向授权项目的私有结果目录）。使用 task-execute 执行平台请求，每次稳定 operation_id 关联本轮计划。重复ID只能取回原回执；改变参数需新操作ID。未知派发结果先核对，不换ID绕过重跑保护。

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

需要读完已观察查询时显式设置coverage.mode=all_observed_queries；只要求达标数量可用默认target_only，仍披露未读范围。不要把查询窗口完整称市场全量。budgets可用max_operations/max_pages/max_detail_reads/max_elapsed_seconds；页数与详情按请求保守预留，时间自创建计，重放不消耗，失败不返还。普通LI搜索不接受任务页预算；上游success:false即阻塞，linkedin_sales_pitch不能误称账号未订阅或通过其他渠道规避。

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

新增能力优先通过 `node scripts/opencli.mjs hunter-linkedin <command> --input input.json -f json` 调用；SalesNav命令加 `salesnav-` 前缀。先确认插件已安装并检查 `--help`；安装未完成时不得声称命令已可用。账号绑定仍来自输入文件，不能以全局Profile选项覆盖。安装与字段规则见 `../../docs/OPENCLI_PLUGIN.md`。旧Node入口保留为内部兼容入口。

## 本机桥接假断连排查

受限执行环境的profile_not_connected或daemon停止提示不单独证明用户未连接。若本机桥接端口已有监听，先在获准访问本机服务的环境只读核对profile list/doctor，仍需明确Profile及本人身份；不要求用户重复连接、不重启正常服务、不切换账号。不要自动提权或绕过权限；宿主需授权时按其机制申请。详见[安装排错](../../docs/INSTALL.md#agent执行环境与假断连排查)。环境检查和真实搜索分别记录，失败不能当零匹配；已用完的搜索预算不自动重置。


## 安装后调用

从本 Skill 目录运行 `node scripts/opencli.mjs hunter-linkedin --help`，可查看全部命令。该入口使用产品自带的固定运行时；不要改用其他全局安装版本。Sales Navigator 需要当前账号实际具备权限，普通 LinkedIn 不需要订阅 Sales Navigator。
