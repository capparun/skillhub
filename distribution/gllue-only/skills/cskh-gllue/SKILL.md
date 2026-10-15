---
name: cskh-gllue
version: 1.3.0
status: developing
description: 使用独立 OpenCLI Gllue 插件搜索人才、读取标准简历与联系记录、查重并编排人工审核。适用于用户明确要求 Gllue 操作，或已启用客户确认 JBF 后的库内寻访。不自动发送消息或写入人才库。
---
# Gllue 库内寻访与回流审核

Skill 负责业务编排与审核交付；原子命令位于 `opencli gllue`，可以脱离 Skill 使用。不修改官方 OpenCLI。

## 输出原则

- 默认先给业务结论、需要用户决定的事项和下一步；命令参数、字段限制与页面实现细节只在执行需要、存在风险或用户追问时展开。
- 不因精简而省略授权门、证据缺口或能力边界。尚未确认的搜索、身份、写入、项目状态和触达状态必须明确指出。

## 启用与预检

- 自动插入 Hunter 流程前，只读取当前任务明确提供的客户本地配置；仅 `integrations.gllue.enabled: true` 时出现该步骤。未提供或未启用则不自动插入；用户明确请求 Gllue 但租户等运行配置缺失时再询问。不按历史任务猜测，也不写全局配置。
- 用户明确要求 Gllue 查询可以执行该查询，不据此永久启用集成。
- 先运行 `opencli doctor` 和 `opencli gllue capability-probe -f json`。核对客户租户；unknown、not_checked 不等于通过。
- 排查登录稳定性时，先在现有已登录标签运行 `opencli gllue session-watch --seconds 45 --site-session persistent -f json`；真实页面操作期间可并行运行同一只读观察命令。它不刷新、不导航、不主动请求。`logout_detected`、`auth_failure_signal` 或 `risk_prompt` 时停止后续业务操作并保留脱敏时间区间；`observer_error` / `unavailable` 只说明无法观察，不能称为退登。`no_logout_signal` 不证明后台登录长期有效，特别是窗口内没有页面自身请求时。
- 登录失效请用户登录；访问限制或页面异常不自动重试。页面探索使用 OpenCLI browser。
- 执行前核对当前命令 --help；源码版本不等于已经发布。

## 当前命令边界

| 命令 | 当前用途与限制 |
|---|---|
| login / test-connection | 登录与页面可见连接检查；`test-connection` 的 `visible_page_only` 不证明后台业务请求有效 |
| session-watch | 原子只读观察命令；记录页面与被动网络的登录异常信号，不做主动探测；没有可见或请求证据时不得宣称后台认证稳定 |
| capability-probe | 关键入口预检，不代替具体业务验收 |
| search-candidates | keyword 查姓名/邮箱；full-text 查全文，二者互斥；scope 明确范围，limit 限量 |
| get-candidate | 标准简历结构化信息、可见联系记录和附件数量提示，不读取 PDF |
| evaluate | 本地证据规则评分；规则须来自本轮已确认 JBF，拒绝覆盖已有评分，不授予触达权限 |
| compare-candidate | 本地比较库内当前值与外部建议值，分类新增、冲突、删除风险和无变化，生成后续授权哈希 |
| add-note | 写入一条快捷备注；选项为租户后台配置的**运行时枚举**（`--list` 只读查看），代码不写死；单击标签即写入（无确认弹窗），一次授权一次点击；合成夹具已验收 |
| update-candidate | 单字段更新预演；15 字段 4 族适配器（含遮蔽邮箱/手机弹窗级读写）已在合成夹具真实写入验收，conflict 覆盖可授权；字段级精确授权 |
| check-exists | 查重线索与规则分数，需人工确认身份 |
| search-jobs / get-job | 职位读取；保留平台默认筛选并逐页本地过滤标题/客户，仍不代表全库搜索 |
| add-candidate | 默认 dry-run；曾获批准在业务租户保存 1 条 `__TEST__` 合成候选人，详情 ID 可回读，但邮箱/电话未展开，严格结果仍为 `uncertain`；不得重试。后续真实创建仍须本轮精确授权 |

`update-candidate` 已实现单字段预演与授权门；15 个写入字段（微信/Skype/渠道/最高学历/邮箱/手机/中文名/英文名/证书/性别/国籍/行业/职能/负责人/意向城市）分 text、textarea、radio、tree 四族适配器，2026-09-29 在合成 `__TEST__` 夹具 #67377 上完成真实写入验收（12 字段端到端，含遮蔽邮箱/手机的弹窗级读写，不点"查看"不耗额度；industry/function 多选覆盖与 owner 归属按决策跳过验收）。`associate-job` 对合成候选人 #67286 与合成职位 #3695 曾精确授权单次提交；CLI 返回 `uncertain`，独立候选人与职位页面却确认关联已落库，故不得重复提交该关联。当前代码增加了回读等待和脱敏失败阶段，但未以第二次真实提交验证修复。关联写入验收仅使用专门构造的测试候选人和测试职位，禁止将真实业务记录当作测试对象；创建测试记录、关联和清理分别确认。审核 HTML 已在真实 Chromium 中完成桌面与手机宽度测试：无横向溢出、无控制台错误，入口与返回链接均可点击；真实业务数据报告仍需在批量读取后单独核验。

## JBF 后库内寻访

1. 使用已确认 JBF，询问是否查询 Gllue 与本轮实际人数；建议 50，未确认不自动开始。
2. 与用户确认搜索范围：`mine` 是我的候选人，`accessible` 是当前账号可访问人才（不是保证全库）。JBF 的岗位/技能词使用 `--full-text`，不能传给按姓名/邮箱查询的 `--keyword`。当前只实测了 mine 范围单关键词；组合、布尔语法和独立岗位筛选尚未验证，不自行猜测。先展示本轮关键词、范围和数量；只有用户同意有限范围列表读取后，才能省略关键词并本地评估。全文命中不等于满足 JBF，仍需详情评估。
3. 对返回的每个人调用 get-candidate，不先筛掉一部分才读详情。10 人以上批次先用 Gllue 插件随包脚本 `<gllue-plugin-root>/scripts/batch-checkpoint.mjs init <search.json> <checkpoint.json> 10` 建立本地检查点，再用 `claim` 固定领取一组；每人完成后携带该 claimId 用 `record` 原子记录。活跃组未结束前不能领取下一组，文件锁阻止并发覆盖；中断后先读 `status`，沿用活跃 claimId，并优先将已存在且身份一致的详情文件记录为 `existing_current_run`，避免重复打开页面。失败记录证据缺口并继续其他已授权人选。PDF 不读，未读附件不算失败。
4. 将已确认 JBF 规则显式写入输入的 `jbf.scoring`，再调用 `opencli gllue evaluate --input <未评分.json> --output <新文件.json>`。命令只匹配明确的 `evidenceTerms`；未命中标未知，必要项未知不进入合格短名单。不得静默修改画像、复制 LinkedIn 人脉加分或编造缺失信息。`contactRecordsScope: rendered_only` 不代表全部历史；空数组不等于从未联系。
5. `evaluate` 只生成 `shortlistProposal`，固定 `approvalRequired=true`、`finalShortlist=false`。本地审核交付中，Gllue 独立板块保留来源、评分依据、缺失信息、归属和触达状态。检查点全部完成后，先用插件随包脚本 `<gllue-plugin-root>/scripts/prepare-review.mjs` 汇总真实搜索条件、逐人耗时与失败，再执行 `<gllue-plugin-root>/scripts/render-review.mjs` 生成独立本地 HTML；仍有 pending / claimed 时必须拒绝出报告。不上传、不称为已上线。未评分显示待评分，不能填零冒充完成。用户明确选择后才由 Skill 保存最终短名单，不把评分建议自动升级。
6. 用户决定是否继续外部寻访，不自动启动 LinkedIn 搜索或触达。

## 回流与触达安全门

仅处理用户从最终短名单选定的人。先查重、读取命中详情，再生成整批预览，最后逐人确认。

- 查重有线索：展示 matchedQueries、理由和冲突，等待身份复核；不创建重复记录、不覆盖已有非空字段。
- 查重无命中：仅表示本轮范围无命中，需审核搜索充分性和新建预览，不直接添加 --confirm。
- exists 是旧阈值标记，不是身份确认；identityConfirmed 为 false 的线索均待复核。规则分数不是身份概率。
- 真实写入绑定当前候选人、当前预览、目标租户与站点及本次明确授权；内容或目标变化重新确认。普通“继续”不代替逐人授权。新建使用 dry-run 返回的 writePreview；只有当前对话逐人批准后才生成绑定 `candidateName`、`contentHash`、`tenant` 与 `origin` 的授权文件，并同时传入 `--confirm --approval <file>`。安全门必须在任何 Gllue 页面访问前通过；同一授权在最终点击前会在本机输出目录一次性占用，`uncertain` 不得换授权重试。
- 先把 `get-candidate` 的身份、来源、观察时间与外部建议字段交给 `compare-candidate`。新增（addition）与覆盖（conflict）均可进入后续授权；删除风险和未核验联系方式必须返回人工处理。`update-candidate` 每次只处理一个字段，默认 dry-run；真实更新需当前对话的候选人+字段+内容哈希授权，且 uncertain 不重试。15 个字段适配器已在合成夹具验收（2026-09-29，见 docs/test-records/gllue-update-fields-acceptance-20260929.md）；遮蔽邮箱/手机的观测与回读都走编辑弹窗输入框，绝不点击"查看/解锁"。真实业务候选人仍须用户逐字段批准后执行。`associate-job` 默认只读预览；合成对象的单次真实提交已由独立页面确认落库，但 CLI 内置回读曾返回 uncertain，不能把它当作命令成功或再次提交。技术验收只能关联专门构造的测试候选人和测试职位，不能使用真实业务记录；创建、关联和清理各自需要明确范围与批准。业务流程中找不到职位不新建，记录“待关联职位”。
- 写后用 get-candidate 回读核验；结果 uncertain 不自动重试。
- 新建只有同租户候选人详情页的唯一 ID 才算成功；重复卡片返回 duplicate_detected，多 ID 返回 uncertain，均不得冒充新建成功或自动重试。
- visible_unverified / not_expanded 不等于联系方式已验证。其他顾问归属或活跃项目默认阻止触达，先获协作确认；状态未知不能默认安全。
- “有电话”等字段筛选只代表字段非空；最近联系日期不包含渠道或触达结果。没有可核验的历史沟通渠道、结果或有效性证据时，不按字段覆盖率或少量职位样本推断全库最常用渠道，只列待核验的触达选项。
- 本 Skill 不发送邮件、微信、短信或 LinkedIn 消息。渠道与个性化内容经人工确认后才交对应能力执行。

## 资料与隐私

参数见 [命令参考](references/commands.md)，顺序见 [工作流](references/workflows.md)。历史页面实现笔记不是当前验收证据。
真实人才数据仅存当前任务本地私有目录，不提交仓库，不用于公开网站或示例。
