# LinkedIn 全局能力复盘与遗漏审计

日期：2026-10-24。结论：此前清单以新统一网关为中心，遗漏旧工作流和底层平台入口，不能当作全局清单。本文补齐本次可访问项目范围内的登记，并明确哪些仍未接入。**列出能力不是授权执行，也不是账号可用性证明。**

## 1. 为什么会漏

1. **范围替换**：用户问整个LinkedIn，我只从gateway.operations和SalesNav CLI导出，把“统一入口已接入”替换成“全局已有”。
2. **混用状态**：未接入、未实现、未验证被写成近似含义，尤其Reach、Recruiter、X-Ray和InMail受影响。
3. **缺少分层核对**：没有同时查Skill编排、独立脚本、Hunter扩展、项目锁定OpenCLI、全局OpenCLI及内部支持库。
4. **验证口径太窄**：先前26项/48字段校验只证明新网关表没有漏项，不能证明整个生态没有遗漏。Reach被指出后也只补Reach，没有立刻做命令差集。
5. **没有迁移账本**：同名命令/同名Skill可能是不同实现，缺少旧入口→新入口→语义差异→接入状态的映射。

这是盘点方法与范围管理问题，不是用户需求不清楚。

## 2. 本次覆盖与证据边界

| 层级 | 本轮检查 | 结果/边界 |
|---|---|---|
| 新统一入口 | gateway、CLI、P/T目录 | 本包12条统一CLI命令、12条平台路由；平台路由含9条SN和3条普通LI |
| 项目锁定运行时 | Hunter launcher list，逐条help | linkedin 25条、hunter-linkedin 15条，共40条；分页总数与实际条数一致，help全部可读 |
| 全局OpenCLI | linkedin list | 同样25个命令名称；不是同一运行时实现/版本的证明 |
| 旧Skill | sourcing-linkedin、outreach；sourcing/align上下游引用 | 寻访、深读、最终名单、触达和邮件草稿；不是只有scout |
| 独立脚本 | discover-linkedin-xray、enrich-linkedin-profiles、outreach脚本 | 非注册命令的入口也列入下表 |
| 内部库 | tier/session/quota/rate-limit/normalizer/evaluator/relationships等 | 作为机制，不虚构独立CLI |
| 常用安装位置 | ~/.agents/skills、~/.codex/skills、当前项目.agents/skills下名称含linkedin/outreach的直接入口 | 本轮未发现匹配名称；不等于其他宿主、缓存、远端或其他命名下未安装 |

数据源为实际命令元数据与源码，不用互联网“LinkedIn功能清单”代替本地实现。未遍历全磁盘、远端/客户安装和所有插件缓存，不声称机器上所有副本已穷尽。没有读取私有会话、发送邀请/消息或更改账号设置。

**数量口径**：原表P/T为26项能力，新增R/O为16项触达能力/组合入口；这些与40条注册命令有重叠，不能相加。40条中原表明确逐项对应14条，另外26条入口未逐项登记。不同入口可完成相似功能，不等于26项全新互斥功能。

## 3. 新发现的遗漏按业务域整理

| 业务域 | 此前未逐项列出的入口 | 与新方案的关系 |
|---|---|---|
| 人员发现 | linkedin people-search；hunter-linkedin recruiter-scout；X-Ray脚本 | 普通基础搜索、Recruiter与搜索引擎发现是不同路径；未接入不等于不存在 |
| 公司研究 | linkedin company；hunter-linkedin company、company-id-lookup | 公司页资料、公司员工名单、公司ID查询互不等价；也不同于SN公司搜索 |
| 人员深读 | profile-experience、profile-projects、services-read；enrich脚本 | profile-read不能被默认当作所有栏目深读已完成 |
| 求职/职位 | linkedin search、job-detail、jobs-preferences | search实际是职位搜索；偏好命令是读取，不是更新设置 |
| 动态与影响力 | timeline、posts、post-analytics、profile-analytics | 内容事实和可见指标，不等于候选匹配判断 |
| SN消息与旧搜索 | salesnav-search、salesnav-inbox、salesnav-thread、salesnav-message | 底层入口存在；API路径、权限和新UI适配器不同，不能自动互作回退 |
| 触达另一套基础入口 | linkedin connect、linkedin thread-snapshot | 与Hunter安全邀请/快照名称相近，但签名、审批封装、实现不同 |
| 本地数据处理 | hunter-linkedin normalize、evaluate、report | 规范化、规则打分、旧格式报告；evaluate不是平台原子操作 |
| 初始化 | linkedin login、hunter-linkedin setup | 登录与本地档位/发现偏好配置；有副作用，不自动运行 |

## 4. 40条实际注册命令的对照表

L编号为本审计的命令索引，不替换P/T/R/O能力编号。所有本轮证据均为注册/help，不默认标记“运行可用”。标记write是上游元数据，需结合源码区分本地写文件、浏览器导航和实际对外发送。

### 底层LinkedIn：25条

| 编号 | 命令 | 功能 | 原表位置 | 统一接入 | 声明访问 |
|---|---|---|---|---|---|
| L01 | `linkedin company` | 公司资料读取 | 此前未单列 | 未映射统一网关 | read |
| L02 | `linkedin connect` | 连接邀请 | 此前未单列 | 未映射统一网关 | write |
| L03 | `linkedin connections` | 已有连接 | R02 | 未映射统一网关 | read |
| L04 | `linkedin inbox` | 收件箱列表 | R04 | 未映射统一网关 | read |
| L05 | `linkedin job-detail` | 职位详情 | 此前未单列 | 未映射统一网关 | read |
| L06 | `linkedin jobs-preferences` | 求职偏好/提醒读取 | 此前未单列 | 未映射统一网关 | read |
| L07 | `linkedin login` | 登录引导 | 此前未单列 | 未映射统一网关 | write |
| L08 | `linkedin people-search` | 普通人员关键词搜索 | 此前未单列 | 未映射统一网关 | read |
| L09 | `linkedin post-analytics` | 动态指标汇总 | 此前未单列 | 未映射统一网关 | read |
| L10 | `linkedin posts` | 个人动态读取 | 此前未单列 | 未映射统一网关 | read |
| L11 | `linkedin profile-analytics` | 本人主页指标 | 此前未单列 | 未映射统一网关 | read |
| L12 | `linkedin profile-experience` | 独立经历读取 | 此前未单列 | 未映射统一网关 | read |
| L13 | `linkedin profile-projects` | 独立项目读取 | 此前未单列 | 未映射统一网关 | read |
| L14 | `linkedin profile-read` | 个人资料读取 | P13 | 已映射统一网关 | read |
| L15 | `linkedin safe-send` | 已有线程消息 | R12 | 未映射统一网关 | write |
| L16 | `linkedin salesnav-inbox` | SN收件箱（API路径） | 此前未单列 | 未映射统一网关 | read |
| L17 | `linkedin salesnav-message` | SN InMail发送/演练（API路径） | 此前未单列 | 未映射统一网关 | write |
| L18 | `linkedin salesnav-search` | SN人员关键词搜索（旧适配器） | 此前未单列 | 未映射统一网关 | read |
| L19 | `linkedin salesnav-thread` | SN线程历史 | 此前未单列 | 未映射统一网关 | read |
| L20 | `linkedin search` | 职位搜索（不是人员搜索） | 此前未单列 | 未映射统一网关 | read |
| L21 | `linkedin sent-invitations` | 已发邀请 | R03 | 未映射统一网关 | read |
| L22 | `linkedin services-read` | 服务页读取 | 此前未单列 | 未映射统一网关 | read |
| L23 | `linkedin thread-snapshot` | 精确会话快照 | 此前未单列 | 未映射统一网关 | read |
| L24 | `linkedin timeline` | 首页动态 | 此前未单列 | 未映射统一网关 | read |
| L25 | `linkedin whoami` | 账号身份 | P04 | 已映射统一网关 | read |

### Hunter扩展：15条

| 编号 | 命令 | 功能 | 原表位置 | 统一接入 | 声明访问 |
|---|---|---|---|---|---|
| L26 | `hunter-linkedin capability-probe` | 目标页面触达能力探测 | R01 | 未映射统一网关 | read |
| L27 | `hunter-linkedin company` | 公司员工寻访 | 此前未单列 | 未映射统一网关 | write |
| L28 | `hunter-linkedin company-id-lookup` | 公司数字ID查询 | 此前未单列 | 未映射统一网关 | read |
| L29 | `hunter-linkedin connect-safe` | 带审批的连接邀请 | R10 | 未映射统一网关 | write |
| L30 | `hunter-linkedin evaluate` | 规则评估/打分 | 此前未单列 | 未映射统一网关 | read |
| L31 | `hunter-linkedin first-message-safe` | 首条消息 | R11 | 未映射统一网关 | write |
| L32 | `hunter-linkedin normalize` | 候选格式标准化 | 此前未单列 | 未映射统一网关 | read |
| L33 | `hunter-linkedin outreach-ledger` | 触达防重台账 | R08/R09 | 未映射统一网关 | write |
| L34 | `hunter-linkedin outreach-plan` | 渠道计划 | R07 | 未映射统一网关 | read |
| L35 | `hunter-linkedin recruiter-scout` | Recruiter寻访 | 此前未单列 | 未映射统一网关 | write |
| L36 | `hunter-linkedin relationship-state` | 关系证据归并 | R06 | 未映射统一网关 | read |
| L37 | `hunter-linkedin report` | 旧寻访报告导出 | 此前未单列 | 未映射统一网关 | read |
| L38 | `hunter-linkedin scout` | 增强普通人员搜索 | P09 | 已映射统一网关 | write |
| L39 | `hunter-linkedin setup` | 账号档位/发现路径配置 | 此前未单列 | 未映射统一网关 | write |
| L40 | `hunter-linkedin thread-snapshot` | Hunter精确线程快照 | R05 | 未映射统一网关 | read |

逐命令的**全部help输入参数名及输出列**保存在 [机器可读清单](reference/linkedin-command-inventory.json)，供Agent对照更新；它是2026-10-24快照，运行前仍需重查实际help。不是要求用户阅读JSON。

## 5. 非注册命令的Skill与脚本

| 入口 | 输入 | 输出/作用 | 整合状态 |
|---|---|---|---|
| 旧cskh-sourcing-linkedin | 已确认招聘需求/渠道计划 | X-Ray/scout/Recruiter发现→初评→深读→最终短名单→报告 | 新包同名兼容Skill只做任务转交，不是旧全流程迁移完成 |
| discover-linkedin-xray.mjs | keyword或plan；title/location/company/exclude/limit等 | 搜索引擎发现与规范化结果；源码声明Google/Brave/Yahoo | 已有脚本，统一网关未接入，当前网页可用性未测 |
| enrich-linkedin-profiles.mjs | 输入候选文件、include、limit、qualifiedOnly等 | 按profile/experience/projects/posts/services补充详情 | 已有脚本；模型评估门槛与新任务条件需对齐 |
| cskh-outreach | 已确认JD/JBF、finalShortlist及逐人/逐条授权 | 关系→计划→草稿→审批→执行→回查→台账 | 外部既有，尚无新任务到触达的自动桥接 |
| 触达collect/execute/summarize脚本 | 既有outreach-contract定义的请求 | 组合读取、安全执行、批次汇总 | 见主手册O01–O03，不能把TaskRequest直接传入 |
| create-email-draft.mjs | 已验证邮箱、完整内容与依据 | 仅本地邮件草稿文件 | 见R13，无发送器 |
| cskh-sourcing / cskh-align | 上游已确认目标/需求 | 渠道分发、需求上下文 | 上游协作层，不是LinkedIn平台原子命令 |

## 6. 内部机制与语义冲突

| 机制/冲突 | 源码证据 | 维护决定 |
|---|---|---|
| 规则评分与模型判断混用 | 旧evaluate调用linkedin-evaluator，旧Skill还描述规则降级 | 保留为旧本地派生能力；不得自动并入“模型判断”或冒充平台事实。统一时需标明评分来源或弃用旧评分 |
| 失败后换X-Ray的旧规则 | 旧Skill异常段允许scout失败后建议X-Ray | 先分故障：定位器/解析错误与访问限制不是一回事。不能机械迁移为拒绝后的跨渠道绕过 |
| 配额与套餐 | lib/linkedin-tier、session-validator、quota-tracker、rate-limiter | 已有实现；本地计数不是平台余额，不因setup设置了档位就认为实测有权限 |
| 公司员工/Recruiter附带参数 | company有autoTag/tagPrefix，recruiter-scout有tagPrefix/skipTierCheck | 接入前核对实际副作用；不能作为纯只读公司详情同义词，也不默认跳过身份/权益检查 |
| 双线程快照/双Connect | linkedin与hunter-linkedin都有相近入口 | 分别保留来源和契约，确定唯一业务路由后再整合，避免维护两套不一致审批 |
| SN UI与旧API路径 | 新SN插件与linkedin salesnav-*并存 | 不把页面访问成功外推为API成功；InMail命令注册存在不等于账号有额度、接口可发 |
| 同名Skill | 本包与旧项目都有cskh-sourcing-linkedin | 安装器可阻止覆盖，但功能替代仍需迁移验证，不能因名称相同宣称兼容完成 |

## 7. 如何防止再次漏项

维护Agent每次做“全局”盘点必须依次：确认仓库/运行时边界 → 读取各运行时list并处理分页 → 全部命令归类 → 读取相关Skill及脚本 → 对照旧表做差集 → 每个入口标明实现来源、接入状态、验证证据与副作用。只校验gateway里的路由不能作为全局完整性检查。

新增/删除命令时同步机器清单和本文；稳定能力编号不重排。不同运行时同名命令保留来源，不按名字直接合并；文档说明“未接入统一入口”，不能写“全局没有”。

接入优先级：先修普通搜索上游误判并复验；再设计最终名单到既有Outreach的明确交接；按真实任务需要补公司ID/员工、深读、Recruiter/X-Ray等读取能力；职位/动态分析可列为独立可选域，不为了全局表齐全一次性把所有写操作开放给统一网关。

本轮只做审计和目录修订，未自动接入任何新命令，未修改外部源码，未更改审批或发布范围。
