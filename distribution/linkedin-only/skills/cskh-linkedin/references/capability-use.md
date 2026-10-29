# 安装后的能力发现与自由编排

## 三层职责

平台原子能力：账号核验、搜索列表、读取 Profile、工作经历、项目经历、公司资料。筛选值是输入参数，不是独立业务能力。
执行保障：身份绑定、预算、锁、结果保存、去重和游标。必须保留，不能为了自由编排绕过。
Skill：理解需求、选择顺序、决定是否补读、判断匹配、解释结果。任务创建、批处理、报告是可选组合能力，不是所有调用的必经流程。

## 安装后发现

从本 Skill 目录运行：

```sh
node scripts/opencli.mjs hunter-linkedin capability-catalog -f json
node scripts/opencli.mjs hunter-linkedin --help -f json
node scripts/opencli.mjs hunter-linkedin capabilities -f json
```

capability-catalog 从当前注册表读取命令及参数，标明历史输出字段与未验证状态；--help 为命令帮助；capabilities 只列统一网关支持的操作，不能当成全产品目录。均不证明账号和浏览器可用。
目录的 `direct_command_contract` 描述直接 CLI 的原始返回、前置条件、影响、错误和验证范围；`gateway_contracts` 描述统一网关的请求及封装，二者不可混用。`platform_contract` 为已补齐的 SalesNav 契约。空值表示契约尚未补齐，不代表命令不存在，也不允许自行猜测输入输出。`verification.live_execution: not_checked` 表示本次目录发现没有执行浏览器；契约内的历史实测记录不等于本次连接可用。

按需只查一个命令，避免每步加载全目录：

```sh
node scripts/opencli.mjs hunter-linkedin capability-catalog --command "linkedin profile-experience" -f json
```

Profile 主页返回的经历/教育文本可能缺失或截断；只有业务需要时再补读相应子页。返回 completed 只表示该能力声明的范围完成，不代表整份简历完整。普通 scout 的 limit 是累计列表目标，续读使用最近一次返回的 cursor，maxPages 是本次页数；不得反复使用旧游标。列表200人不等于读取了200人详情。

选定命令后读取该命令 `--help -f json`。使用 `--input` 的命令还须读取产品文档中的 JSON 输入契约；help 中的 input 文件参数不等于完整业务 schema。

## 选择执行方式

- 单个原子操作：可直接使用固定入口下的对应命令，或通过 plan 校验后 execute；必须满足账号绑定及用户授权。
- 多步、需续读或恢复：优先 task-create / task-execute / task-status；task-continue 仅适用已声明的单查询普通列表续读。
- 用户改变需求：模型重新规划受影响步骤，保留已有结果；账号或查询变化不得复用旧游标，条件变化不得沿用旧评估。
- 只读十人的经历、停止搜索评估已有名单、跳过详情等都允许，不强制完整流水线。

## 原子能力契约与验证

每项能力必须明确输入、输出、适用账号、外部影响、错误和验证证据。当前 help 是参数依据，历史命令目录仅供检索；不存在的教育/证书能力不得从用户全局目录拼装。

| 核验层 | 能证明什么 |
| --- | --- |
| 当前安装入口及 help | 命令存在、参数可发现 |
| 离线输入输出测试 | 指定合成数据的契约成立 |
| 当前账号真实执行 | 指定平台操作可用 |
| Skill 组合验收 | Agent 能按业务需求编排这些操作 |

历史通过不能代替当前安装验收。执行失败保留错误与局部结果，不能改代码或切旧入口制造成功。

### 中断后的列表进度
先调用 `task-recovery` 读取任务记录。`search_checkpoints` 保存该任务每页完成后的游标位置与累计人数；`saved_not_revalidated` 仅表示已落盘，不等于账号、有效期或执行停止已核验。`resumable:false` 时不得自行把游标交给搜索、删锁或改原回执。未知执行结果先诊断，再按用户已批准的范围恢复；未完成诊断时报告已保存数量及阻断原因。

超时或锁异常时按需读取 [中断诊断与恢复边界](recovery.md)，不要仅凭PID退出或pending=0恢复操作。

### 普通LinkedIn身份核验与导航
统一网关执行普通平台操作前，通过 `identity-check` 在当前LinkedIn页面实时读取账号身份，不依赖身份缓存。无站内页面时直接初始化到请求目标页面；账号诊断 `account.inspect` 仍执行完整官方whoami。此优化消除网关的固定回首页导航，不保证上游资料命令或平台自身重定向完全不导航。
