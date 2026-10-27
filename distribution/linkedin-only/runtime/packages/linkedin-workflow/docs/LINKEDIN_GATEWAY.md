# LinkedIn 统一入口：开发版

> 当前状态以文末“dev.11收口”与ATOMIC_CAPABILITIES.md为准；下文按日期保留阶段历史，不将早期未完成清单作为现状。

统一 Skill：`skills/cskh-linkedin/SKILL.md`。现有 SalesNav CLI、Skill 均保持兼容。这一版实现任务校验、操作规划、两类平台调用和结果信封；不是完整设计已上线。

## CLI

```sh
node src/linkedin-cli.mjs capabilities
node src/linkedin-cli.mjs task-validate task.json
node src/linkedin-cli.mjs plan operation.json
node src/linkedin-cli.mjs execute operation.json
```

capabilities 为本地实现清单，不证明账号权限。plan 仅编译参数，不连接浏览器。

任务示例：
```json
{"task_id":"research-001","intent":"company_discovery","criteria":[{"description":"用户指定的行业与地区要求","strength":"required"}],"target":{"count":100,"meaning":"qualified"}}
```

平台操作示例（使用真实绑定值替换示例，不将账号写入仓库）：
```json
{"provider":"salesnav","operation":"company.search","account":{"profile":"PROFILE","expected_identity":"EXACT DISPLAY NAME","expected_profile_url":"https://www.linkedin.com/in/SELF/"},"input":{"keywords":"dental","filters":{},"limit":25,"max_pages":1}}
```

普通 LinkedIn 需要环境变量 `HUNTER_OPENCLI_ENTRY` 指向已安装 Hunter 的绝对 launcher 路径；不自动安装、不回退到全局 OpenCLI。person.search 使用 keyword/location/connection/currentCompany/pastCompany/school/industry/language/limit；person.read 使用 profile_url。不支持的参数直接拒绝。普通调用先检查 whoami 的 logged_in/name/public_id，无法识别响应也停止，不猜测身份。

SalesNav 支持 account.inspect、capabilities.list、filters.resolve、company.search、person.search、search.next、company.read、person.read、operations.batch，input 与原 CLI 对应命令一致。filter-options 使用 UI 字段名，搜索使用字段 key，二者不能混用。批处理仍只有原有四种搜索/详情步骤，不扩大成任意命令执行。

## 输出

schema_version、provider、operation、status、qualification、data、error、coverage、resume。data 保留原平台事实，coverage 未提供的字段为未知，不把缺失总数当0。resume 绑定平台与账号；游标有效性仍由原适配器验证。

`completed` 表示本次操作完成，不代表业务目标完成。qualification 固定为 not_evaluated；模型在独立 assessment 中评估用户条件。部分回执保留已完成结果；上游拒绝不触发其他平台重试。

## 已知范围

- 普通 LinkedIn 每次执行先核验身份，暂无跨命令身份缓存。
- 统一网关普通路径与原 SalesNav CLI 共用 profile 锁。绕过网关的旧普通 CLI 不受锁保护，禁止并发使用。
- 没有重写搜索器、业务评分或网页解析器；没有发送、保存名单等写操作。
- 旧招聘 Skill 尚未改为转交入口；原源码位于另一项目。本版新 Skill 可显式调用，未全局安装。
- Recruiter、X-Ray、跨渠道实体归并、持久任务账本、自动报告编排属于后续集成。当前由 Skill 保存任务记录，HTML/CSV复用原 export。
- 测试使用合成回执。真实账号跨平台端到端尚未验收；没有发布、推送或改动外部项目。

## 本轮验证（2026-10-24）

`npm test`：157/157通过，其中新增8项网关契约测试，覆盖参数保真、账号覆盖拒绝、身份不符停止、字面argv、部分回执、游标平台绑定和拒绝后不降级。普通LinkedIn命令参数以本地launcher实际help核对。未执行真实搜索，不产生新的业务数据。

## 持久任务闭环（2026-10-24 新增）

下列命令仍使用 `node src/linkedin-cli.mjs <command> input.json`。

| 命令 | 文件输入 | 输出 |
|---|---|---|
| task-create | directory、task | 创建只写一次的任务定义 |
| task-execute | directory、task_id、operation_id、request | 保存派发记录和回执；同ID同参数重放本地回执 |
| task-status | directory、task_id | 操作账本、覆盖、游标、去重实体和原始观察 |
| task-assess | directory、task_id、assessment_id、assessments | 保存模型判断版本，不自动打分 |
| task-report | directory、task_id、assessment_id、report_id | HTML、普通列式CSV、实际数量与状态 |

Task 示例增加 `evidence_scope`（例如“合成数据，非真实平台”）及可选 `budgets.max_operations`（任务总操作请求上限，批次算一次请求；不等于OpenCLI调用预算）。每次操作的 request_budget 仍由原适配器管理。累计操作上限跨进程保留，重放旧回执不再消耗。

评估条目为 `{key,status,reason,evidence}`。status 是 qualified/not_qualified/insufficient_evidence。qualified 的每项硬条件都要求 evidence 含 criterion_index、operation_id、source、explanation；operation_id 必须实际观察过该实体。模型负责证据语义真实性，工具仅检查完整性与关联，不能把结构校验称作事实验证。

去重只使用完全相同的公开 LinkedIn URL，或平台命名空间内完全相同的ID。不凭同名合并集团/子公司；每次观察仍保留。发现任务不一致、操作ID复用但参数变化或账号变化时拒绝执行。已有派发记录而缺结果时返回 operation_outcome_unknown，不自动重跑。条件变化应新建任务，不能修改原定义来复用旧评估。

此阶段不自动解析旧 SourcingRequest，不自动跨平台映射实体，也不自动解除未知操作或过期游标。旧招聘入口尚未改写。报告完成仅按数量目标和未解决操作计算，不声称搜索范围穷尽；额外业务覆盖要求仍需模型检查。任务目录必须位于用户授权的项目私有位置，不提交真实数据。

验证更新：166项测试通过，包括持久回执重放、中断未知阻止重跑、账号/任务隔离、跨查询去重、硬条件证据关联、人可读报告和跨进程累计预算。真实平台闭环与安装包尚未验收。

## 招聘兼容与隔离安装

包内增加 `skills/cskh-sourcing-linkedin`，转交统一 Skill；不会覆盖外部项目或已经安装的同名 Skill。

`task-import-sourcing` 输入：directory、confirmed（必须明确true）、sourcing_request（原文对象）、task（people_discovery）、mapping_note。模型负责把画像映射为明确条件，工具保存原文与映射，不能凭输入结构伪造用户确认。

```sh
node scripts/install-skill.mjs --project /absolute/project --skill cskh-linkedin
node scripts/install-skill.mjs --project /absolute/project --skill cskh-sourcing-linkedin
```

省略 --skill 保持原 SalesNav 安装行为。已存在不同来源入口时拒绝覆盖；--remove 仅移除本安装器指向本包的链接。

2026-10-24：工作区 npm pack 开发快照已在临时隔离目录解包，三个 Skill 的安装和入口加载通过，包中未包含 .local、workflow-runs 或业务输出。不是正式候选发布：正式构建器要求干净、已提交来源，当前工作区仍有其他未提交改动，未绕过该要求。普通 LinkedIn account.inspect 已在指定账号真实核验通过，不外推人员搜索与完整业务验收。

### 真实响应适配补充

普通 LinkedIn profile-read 真实返回数组，现转换为统一 results，同时保留 raw_response 和原始行。公开个人主页链接的查询参数不作为实体身份；简介和经历均缺失时标 partial，不冒充完整履历。当前已验证具体账号的 whoami 和本人主页读取；不据此外推 scout 搜索所有响应形态。

回归更新：168项通过。entity_read 任务存在 partial 读取时，报告不会仅因实体数量够而标完成。

## 公司到人员的业务衔接与状态收口

- `task-company-people`：输入 parent（directory、task_id）、company_keys（父任务实际实体键）、directory（新目录）、task（新的 people_discovery 目标）。保存选定公司的原始观察和父任务版本，不复制公司任务的行业/规模条件为人员条件，也不自动发起搜索。模型读取公司快照并解析平台公司选项，再按目标角色执行人员搜索。
- `task-resolve`：输入 directory、task_id、operation_id、replacement_id、reason。仅允许明确局部参数错误被同平台同操作的 completed 回执替代，记录模型说明并保留原失败。权限/登录/验证码/未知结果不能用此入口关闭，不能以换ID规避限制。
- `task-status`：报告状态回写到 delivery.json；账本、评估或关闭记录变化后返回 in_progress，避免旧报告误当最新结果。latest_delivery 保留旧交付路径。
- 普通人员搜索若上游提供分页、截断、完整性和停止原因，现在保留这些字段；无法获取的仍标未知。

本轮172项回归通过，新增覆盖公司到人员的来源追溯、完成状态失效和局部错误关闭边界。新衔接路径为合成验收，未新增真实公司搜索；不会把已有169项阶段包当作本轮更新后的包。

### 输入文件与任务目录分离

将 CLI 请求文件放在独立 inputs/ 目录，任务 directory 指向另一个结果目录。不要把请求命名为任务目录内的 task.json、account.json、delivery.json 或 *.planned.json/*.result.json/*.assessment.json/*.resolution.json；这些是账本保留文件。真实验收曾因 account.json 输入与账号绑定冲突在派发前被拒绝，改用独立输入路径后恢复，未发生错误账号访问。

### 自动复用账号检查上下文

`task-execute` 对 SalesNav 请求，在调用者未指定 `execution_context` 时，从当前任务最近一条 SalesNav 回执选择仍有效且至少剩余 5 秒的上下文。同任务账号绑定先行校验；最近操作失败、结果未知、时间顺序无法区分或上下文过期时不复用，也不回溯更旧凭据。原请求用于幂等判断，实际派发参数保存在 `effective_request`，重放不会重新派发。底层继续核验账号、自有主页和连接代次，失败不会自动重试。

这减少重复完整能力诊断，不等于跨 CLI 进程持有浏览器会话。独立操作仍需一次身份核验页面；已知的多条搜索/详情可使用 `operations.batch`，在同一个受控会话内复用身份检查。不要为了少导航而跳过账号核验。

报告中，未提供模型评估的对象显示“未评估”；模型已评估但资料不能支撑条件的对象显示“证据不足”。两者均不计入符合数量。

## dev.11收口（2026-10-24）

当前任职单数/复数标题及段落布局已兼容，原人员样本详情复验通过，任务1符合/2未评估。普通LinkedIn真实上游返回success:false、linkedin_sales_pitch；网关现保留具体错误，停止该路径。candidates/meta形态有契约测试，正常搜索仍未真实通过。

新增coverage.mode：target_only默认；all_observed_queries要求所有已观察查询最后回执complete，缺失指纹/普通搜索覆盖未知不能冒充完整。不是全市场覆盖承诺。报告增加公司/人员业务列及counts分类。

预算支持max_operations、max_pages、max_detail_reads、max_elapsed_seconds，均为正整数；不支持的键拒绝，避免静默忽略。页数为累计请求max_pages预留（省略按1），详情按动作预留，batch逐子步骤计入；失败/未知不返还，回执重放不消耗。普通LinkedIn无可靠页数限制，带页预算的该搜索拒绝派发。时间自任务创建累计，过期阻止派发，子进程使用剩余超时；超时不能证明上游取消成功，保留未知并停止。

源码和包应以本轮固定提交复验，历史开发快照不代表最新包；当前仍不宣称正式上线。

### 人员列表覆盖下限

人员发现任务可传 `coverage: {mode: "target_only", min_unique_people: 200}`；`min_unique_people` 为正整数，仅适用于 people_discovery，也可与 all_observed_queries 共用。CLI 不自行默认 200，Skill 在未指定列表量的新人员搜索任务中提供该值。固定名单核实不应用此默认值。

task-status 和 task-report 返回 list_coverage：minimum、unique_people、remaining、met。按人员搜索/续页结果的现有实体键跨操作去重，批量操作仅统计 lead-search；纯详情读取不计入。缺少稳定 ID/主页的行不能计数。覆盖不足时报告 partial，即使合格目标已达到；报告显示实际数、下限和缺口。预算及平台阻塞仍优先停止，默认下限不扩大授权。
