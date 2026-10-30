# LinkedIn 能力全景（86 个已注册命令）

安装后先读这一页，再决定用哪个命令；不要凭文件名猜测，也不要把"已注册"当成"当前账号可用"。

## 先确定你要查什么

| 你要的东西 | 用什么 |
| --- | --- |
| 全部命令的一句话清单（86 行） | `node scripts/opencli.mjs hunter-linkedin capability-catalog --summary -f json` |
| 某个命令的参数与契约 | `node scripts/opencli.mjs hunter-linkedin capability-catalog --command "linkedin profile-read" -f json` |
| 统一网关支持哪些操作 | `node scripts/opencli.mjs hunter-linkedin capabilities -f json` |
| 本页判断"能不能做/该用哪个"，不做参数校验 | 直接看下面分组表 |

本页只证明命令已安装、用途大致是什么。真实可用性必须由一次真实执行验证；历史成功记录不能代表当前安装可用。

## 选择关系（最容易选错的五组）

| 场景 | 优先 | 不要用 |
| --- | --- | --- |
| 带地点/人脉/公司/学校/行业/语言筛选的人才搜索 | `hunter-linkedin scout` | `linkedin people-search`（只支持关键词） |
| 已有明确主页 URL，读多人的经历/教育 | `hunter-linkedin profile-read-batch`（带预算、续读、逐人落盘） | 循环调 `linkedin profile-read`（每人多次导航） |
| 单个公开主页的区块概览 | `linkedin profile-read` | `profile-read-batch`（杀鸡用牛刀） |
| 需要记录、可恢复、可评估的多步寻访 | `task-create` → `task-execute` → `task-assess` | 直接 `execute`（只有单次回执，无台账） |
| 触碰真实账号的发送类动作 | `connect-safe` / `first-message-safe` / `safe-send`（默认演练，需人工审批） | `linkedin connect` / `linkedin safe-send`（无审批闸门） |

## A. 账号与身份（7）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `linkedin whoami` | 读取当前浏览器登录的账号（public_id、姓名） | 需已登录；不发请求 | 只读会话 |
| `hunter-linkedin identity-check` | 针对一个目标页实时核验身份，结论不缓存 | 需已登录；可能初始化一次目标页 | 网关执行前的固定步骤 |
| `hunter-linkedin account-inspect` | 账号/订阅诊断（本地包装） | 需已登录 | 不直接读浏览器 |
| `hunter-linkedin capabilities` | 列出统一网关支持的操作 | 本地 | 不是全产品目录 |
| `hunter-linkedin salesnav-account-check` | SalesNav 完整账号检查 | 需 SalesNav 席位 | 会打开多个 SalesNav 页 |
| `hunter-linkedin salesnav-doctor` | 环境与浏览器桥接诊断 | 本地 + 一次桥接探测 | 冷启动排障优先 |
| `hunter-linkedin salesnav-capabilities` | SalesNav 能力与筛选字段目录 | 需 SalesNav | 读平台契约 |

## B. 登录与能力发现（2）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `linkedin login` | 打开登录页并等待会话建立 | 写：需要人工完成登录 | 不要自动化反复调用 |
| `hunter-linkedin capability-catalog` | 读取当前安装的命令、参数、契约 | 本地，不访问浏览器 | `--summary` 出精简清单 |

## C. 普通人才搜索与名单（5）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `hunter-linkedin scout` | 增强搜索：地点/人脉/公司/学校/行业/语言筛选，输出统一 schema | 消耗 LinkedIn 商用搜索额度（CUL）；`limit` 是累计目标，`maxPages` 是本次页数 | 带游标续读与匿名卡策略 |
| `linkedin people-search` | 关键词搜索人（不支持 faceted 筛选） | 消耗 CUL | 简单关键词时可用 |
| `linkedin connections` | 列出自己的一度人脉（姓名/职位/主页） | 只读 | 适合"我认识谁"类需求 |
| `linkedin sent-invitations` | 列出已发出、待处理的邀请 | 只读 | CRM 对账用 |
| `hunter-linkedin recruiter-scout` | LinkedIn Recruiter 企业版人才搜索 | 需 Recruiter 席位 | 与 scout 结果口径不同，不混用 |

## D. 档案、经历与主页内容（11）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `linkedin profile-read` | 读主页区块：headline/About/经历/教育/Services/精选 | 1-2 次导航 | 结构化预览，不等于完整简历 |
| `linkedin profile-experience` | 经历锚点页（`/details/experience/`）逐条 | 1 次导航 | 需要完整经历时读它 |
| `linkedin profile-projects` | 项目锚点页 | 1 次导航 | 项目经历 |
| `hunter-linkedin profile-education` | 教育锚点页（`/details/education/`） | 1 次导航 | 内置 opencli 无此命令 |
| `hunter-linkedin profile-read-batch` | 一个会话内顺序读多人；预算、检查点、`profiles.jsonl` 逐人落盘 | 每人 2 次导航；节奏等待计入 `--budget` | 稳态每次 3–5 人，失败不自动重试 |
| `linkedin profile-analytics` | 主页仪表盘指标（浏览、曝光、搜索出现次数） | 通常仅本人可见 | 不是候选人评估 |
| `linkedin posts` | 导出主页动态及互动数据 | 1 次导航 | 内容侧证据 |
| `linkedin post-analytics` | 汇总可见动态计数 | 1 次导航 | 不生成评分 |
| `linkedin services-read` | Services 页（服务、价格、可预约） | 1 次导航 | 自由职业者资料 |
| `hunter-linkedin capability-probe` | 在精确主页上探测可见动作（Connect/Message） | 1 次导航；需精确姓名匹配 | 只读，不点发送 |
| `linkedin timeline` | 读取首页时间线动态 | 1 次导航 | 信息流样本，不代表全部 |

## E. 公司与组织（6）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `linkedin company` | 读公司主页资料（行业、规模、总部、网站、关注者） | 1 次导航 | 公司画像 |
| `hunter-linkedin company-id-lookup` | 公司 slug/URL → 数字 ID | 1 次导航 | 高级筛选前必须先拿 ID |
| `hunter-linkedin school-id-lookup` | 学校 slug/URL → 数字 ID | 1 次导航 | `--school` 只收数字 ID，先用它解析 |
| `hunter-linkedin company` | 按公司搜员工（可按关键词/地点筛） | 消耗 CUL；会本地打标签 | 员工清单，不改平台 |
| `hunter-linkedin salesnav-account-search` | SalesNav 公司搜索 | 需 SalesNav | 支持公司侧筛选 |
| `hunter-linkedin salesnav-account-read` | SalesNav 公司详情 | 需 SalesNav | 与 builtin `company` 口径不同 |

## F. 关系与触达（9）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `hunter-linkedin relationship-state` | 合并连接、待处理邀请、会话、主页动作，给出关系状态 | 本地汇总；需输入已有结果 | 判断"能不能直接发消息" |
| `hunter-linkedin outreach-plan` | 生成确定性渠道计划 | 本地 | 不生成话术、不发送 |
| `hunter-linkedin outreach-ledger` | 触达台账：审批、幂等、防重复 | 本地写 | 发送前必经 |
| `hunter-linkedin collect-outreach-context` | 联系前上下文（最近互动等） | 本地读 | 给话术提供依据 |
| `hunter-linkedin create-email-draft` | 生成本地邮件草稿 | 本地写 | 不发信 |
| `hunter-linkedin execute-approved-outreach` | 执行已获人工批准的联系动作 | 需审批文件 | 写：真实动作 |
| `hunter-linkedin summarize-outreach-batch` | 汇总既有触达结果 | 本地写 | 不重发 |
| `hunter-linkedin connect-safe` | 邀请弹窗内核验姓名，默认演练 | 写：`send=true` + 审批才发送 | 与 `linkedin connect` 的区别是闸门 |
| `linkedin connect` | 直接发送邀请（fail-closed，核验主页） | 写：真实发送 | 无人工审批闸门，慎用 |

## G. 消息（8）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `linkedin inbox` | 列出会话与未读数 | 只读 | 收件箱概览 |
| `linkedin thread-snapshot` | 读取单个会话的结构化快照 | 1 次导航 | 内置命令 |
| `hunter-linkedin thread-snapshot` | 同上，产品侧包装（不改全局 OpenCLI） | 1 次导航 | 二者按入口兼容性选择 |
| `linkedin safe-send` | 核验会话、收件人、最新一条后发送 | 写：真实发送 | 默认 fail-closed |
| `hunter-linkedin first-message-safe` | 对一度连接创建首条消息，默认只填草稿 | 写：审批后发送 | 新连接首条 |
| `hunter-linkedin salesnav-inbox` | SalesNav 会话列表 | 需 SalesNav | 分页 |
| `hunter-linkedin salesnav-thread` | SalesNav 会话完整历史 | 需 SalesNav | 按 thread id/URL |
| `hunter-linkedin salesnav-message` | SalesNav InMail：默认 dry-run | 需 SalesNav + InMail 额度 | 写 |

## H. 求职侧（3）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `linkedin search` | 搜索职位 | 只读 | 职位侧情报 |
| `linkedin job-detail` | 单个职位详情（描述、投递链接、工作方式、申请人） | 1 次导航 | 给 JD 分析提供原文 |
| `linkedin jobs-preferences` | 读取求职偏好与提醒设置 | 只读 | 不改设置 |

## I. 评估、报告与外部发现（5）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `hunter-linkedin normalize` | X-Ray/Scout 结果 → 统一候选人格式 | 本地 | 下游评估/报告的前置 |
| `hunter-linkedin evaluate` | 按 JD/寻访方案打分并输出评估结果 | 本地 | 规则评估，不是模型判断 |
| `hunter-linkedin report` | 生成 Markdown/CSV/JSON/HTML 报告 | 本地 | 单批结果 |
| `hunter-linkedin discover-linkedin-xray` | 用搜索引擎发现站外/公开档案 | 不使用 LinkedIn 浏览器 | 结果需人工核验 |
| `hunter-linkedin enrich-linkedin-profiles` | 批量补充资料 | 会触发多次读取 | 受同一账号锁与预算约束 |

## J. 任务编排（17）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `hunter-linkedin task-create` | 建立任务账本（intent/criteria/target） | 本地写 | 多步任务起点 |
| `hunter-linkedin task-validate` | 校验任务定义 | 本地读 | 建任务后立即跑 |
| `hunter-linkedin task-import-sourcing` | 导入已确认寻访需求（SourcingRequest） | 本地写 | 与 align 产物对接 |
| `hunter-linkedin task-execute` | 记账后执行平台请求 | 写：会调用平台 | 单查询、可恢复 |
| `hunter-linkedin task-status` | 读取任务与证据版本 | 本地读 | 恢复前先看它 |
| `hunter-linkedin task-continue` | 从任务最新进度续读普通列表 | 本地读 | 只适用单查询普通列表 |
| `hunter-linkedin task-resume` | 原账本内续跑待处理详情 | 写 | 补读，不重搜 |
| `hunter-linkedin task-recovery` | 已读/待读与中断清单 | 本地读 | 中断诊断入口 |
| `hunter-linkedin task-assess` | 保存模型判断（evidence/assessment/gap） | 本地写 | 模型负责结论 |
| `hunter-linkedin task-report` | 单任务 HTML/CSV 报告 | 本地写 | 评估后产出 |
| `hunter-linkedin task-consolidate` | 跨批次正式汇总 | 本地写 | 多批合并 |
| `hunter-linkedin task-company-people` | 公司任务转人员任务 | 本地写 | 派生任务 |
| `hunter-linkedin task-resolve` | 登记局部失败的替代处理 | 本地写 | 不掩盖失败 |
| `hunter-linkedin task-lock-inspect` | 检查任务锁 | 本地读 | 不释放 |
| `hunter-linkedin task-lock-recover` | 核验退出后恢复任务锁 | 本地写 | 不重跑操作 |
| `hunter-linkedin task-prepare-outreach` | 生成待批准联系名单 | 本地写 | 触达前置 |
| `hunter-linkedin task-outreach-input` | 转换旧招聘触达输入 | 本地写 | 兼容老数据 |

## K. 执行保障与 SalesNav 工具（12）

| 命令 | 用途 | 前置 / 成本 | 备注 |
| --- | --- | --- | --- |
| `hunter-linkedin plan` | 编译平台请求，不发生浏览器操作 | 本地 | 执行前预检 |
| `hunter-linkedin execute` | 执行单项平台请求（带身份校验与锁） | 写：真实操作 | 单次回执，无台账 |
| `hunter-linkedin route-options` | 基于已有证据比较路由 | 本地 | 不自动切换渠道 |
| `hunter-linkedin profile-lock-inspect` | 只读核对账号锁持有者 | 本地读 | 不释放 |
| `hunter-linkedin profile-lock-recover` | 核验持有者退出后归档锁 | 本地写 | 不重跑 |
| `hunter-linkedin setup` | 配置账号档位与首选发现路径 | 写：本地配置 | 首次安装后跑一次 |
| `hunter-linkedin salesnav-lead-search` | SalesNav 人员搜索 | 需 SalesNav | 与 scout 参数体系不同 |
| `hunter-linkedin salesnav-lead-read` | SalesNav 人员详情 | 需 SalesNav | — |
| `hunter-linkedin salesnav-search-page` | SalesNav 游标续读 | 需游标 | 不跨平台转译游标 |
| `hunter-linkedin salesnav-filter-options` | 解析 SalesNav 筛选选项 | 需 SalesNav | 高级筛选前用 |
| `hunter-linkedin salesnav-batch` | 同会话批量操作 | 写 | 受锁约束 |
| `hunter-linkedin salesnav-export` | 本地导出 | 本地写 | 不触平台 |

## 使用纪律

- 未在"选择关系"表里确认前，不要同时用两个同类命令（如 scout + people-search 同查询）。
- 全表 86 个命令都只证明"已注册"；`verification.live_execution` 一律从 `not_checked` 开始。
- 需要写入、发送或关闭账号的动作，先经人工审批并写入台账；不要用 `linkedin connect` / `linkedin safe-send` 绕过闸门。
- 额度：CUL 只被 `people-search` / `scout` / `company` 等搜索类命令消耗；读主页不消耗 CUL，但计入浏览行为。
