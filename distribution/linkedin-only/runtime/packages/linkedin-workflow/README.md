# CSKH LinkedIn SalesNav（开发源码）

独立 Sales Navigator CLI + Skill 开发仓库。模型负责变化的业务需求、查询策略和匹配判断；确定性适配器负责账号核对、控件操作、结果读取和本地导出。无需 Align，生产运行时没有 Node 第三方依赖。受控浏览器开发验收使用现有 Playwright，详见 test/acceptance/README.md。

**开发候选版，尚未正式发布。** 默认查询返回首屏卡片；启用有界采集后可滚动读取整页、跨页及中断恢复。完整范围和剩余验收见 [PRD](docs/PRD.md)、[E2E 计划](docs/E2E_TEST_PLAN.md)、[状态](docs/STATUS.md)和[验收台账](docs/ACCEPTANCE.md)。

## 环境与首次检查

当前验证环境：macOS、Node.js 22+、已安装 OpenCLI 2.0.1、Chrome 扩展 1.0.26。其他系统和宿主尚未完成安装验收。命令不安装或修改全局工具。

```sh
node src/cli.mjs doctor '{"profile":"<Profile 标识>"}'
node src/cli.mjs capabilities
node src/cli.mjs account-check '{"profile":"<Profile 标识>","expected_identity":"<站内完整显示名>"}'
```

账号检查分别返回连接、身份、工作台、公司/人员搜索、套餐和当前 InMail 余额。`InMail available` 是当前可用数，不是每月配额。读取不到保持 unknown；普通 Premium 标记不能证明 SalesNav 权限。

搜索、详情和实时能力发现必须给 `expected_profile_url`，使用期望账号的规范 LinkedIn 自有资料链接。账号检查会从当前用户侧栏读取自有链接并比较；此链接仍可变，点时诊断不是永久授权。Profile 或身份不符时不会切换其他账号继续。

账号检查分别返回 `subscription`（套餐）、分项访问能力、`nominal_quota`（标称月配额）、`official_balance`（当前余额）及 `local_budget`（本地工具调用预算）。没有观察到官方标称配额时，`nominal_quota.status` 为 `unknown`、`value` 为 `null`；不得从当前余额推算。

## 同一任务的检查复用

完整 `account-check` 成功核对账号后，可能返回 `execution_context.id`。后续搜索、详情、选项和实时能力命令可在同一输入层传入 `"execution_context":"<id>"`。无需该参数也可执行，仍进行完整检查。

快照最长 5 分钟，绑定适配器版本、明确 Profile、显示名和自有资料 URL，保存在本地私有临时目录。它不是永久授权。每次操作仍核对 Profile 连接、守护进程/扩展连接代次和当前自有 URL，并由操作核验目标页面、条件和实体。套餐/余额保留完整检查时的时间及 snapshot 来源，不冒充重新获取的当前余额。完整 `account-check` 自身始终重新读取，不接受旧 context 替代。

过期、重新连接、身份变化或浏览器执行失败后重新进行完整检查。`context_expired` / `context_invalidated` / `invalid_execution_context` 不应通过删掉业务筛选或切换账号兜底。过期文件在后续签发时回收；目录不包含 Cookie、密码或访问令牌，不进入源码包。

同一命令只使用一个自有浏览器 session，在 finally 关闭。预算为关闭操作预留一次调用；关闭失败会返回独立 cleanup 状态及 session，不能重复业务操作来清理。用户已有或绑定的页面不参与自动关闭。

## 能力发现与候选

无参数 `capabilities` 返回本地操作和输入字段目录。带账号绑定和 `search_type`（account/lead）时，会打开对应筛选页，分别报告可见性、未知锁定状态、实现支持和实测模式。

`filter-options` 参数：账号绑定、`search_type`、可见字段名 `field`；实体候选另给 `query`。返回原始 UI label、数量后缀、包含/排除模式、同名出现次数及来源。平台 ID 不可读时为 null。默认建议与查询候选不混报，同名歧义不自动猜选。

## 全部筛选参数

公司15项、人员33项（含2项CRM受限入口）。完整字段、类型、单位及实测边界见 [全部筛选参数](docs/ALL_FILTERS.md)。以下是原始核心字段速查；范围、姓名和开关见完整清单。

## 公司和人员搜索

`account-search` / `lead-search` 使用：

每次请求完整声明当次条件，不继承旧查询。省略某个字段表示新查询不使用它；`filters:{}` 配合关键词表示不加字段过滤。实体/枚举字段值数组必须非空，`[]` 会明确拒绝；要清除该字段，在新请求中省略它。关键词也可省略以清除，但至少保留一个关键词或字段条件，避免无条件采集。

```json
{
  "profile": "<Profile 标识>",
  "expected_identity": "<站内完整显示名>",
  "expected_profile_url": "https://www.linkedin.com/in/<期望账号>/",
  "filters": {
    "<字段 key>": [{"label": "<真实候选标签>", "mode": "include"}]
  },
  "limit": 3,
  "request_budget": 120
}
```

| 搜索类型 | 字段 key | 可见字段名 | 模式 |
| --- | --- | --- | --- |
| account | company_headcount | Company headcount | include |
| account | industry | Industry | include |
| account | headquarters_location | Headquarters location | include |
| lead | current_company | Current company | include |
| lead | geography | Geography | include |
| lead | title | Current job title | include；exclude 为开发验证模式 |
| lead | function | Function | include；exclude 为开发验证模式 |
| lead | seniority | Seniority level | include / exclude，均已实测 |

一个字段可提供多个明确值。查询先建立干净状态，逐项选择并比较 URL 中的真实条件与字段内已选标签。未生效、歧义或未支持的条件会失败，不会静默删除。没有结果时也不会放宽条件。

`keywords` 可选；通用输入支持最多 1000 字符的原样文本，包括引号、括号、Boolean 和 Unicode；工具不改写表达式，语义由平台解释。控制字符、空白及超长文本拒绝。旧接口仍保留简单关键词限制。通用输入的 `limit` 为 1–2500；超过 5 或显式给 `max_pages` 时启用有界采集。旧接口的单字符串 `company_headcount` / `geography` 保留兼容，不与 `filters` 混用。

默认首屏结果标为 partial；有界采集返回实体 ID、名称、来源 URL、观察时间和命中页位置。明确的公司/人员空结果标为 verified_empty；加载、缺卡片、超时不算零结果。公司总部、人员所在地、业务覆盖与区域团队人数是不同概念，由模型按需求判断。

## 有界分页与恢复

通用搜索输入显式设置 `max_pages`（每次 1–10，默认 1）或 `limit > 5` 可启用采集器。它按结果列表中的位置滚动，覆盖虚拟化条目，逐页验证 URL、页码、账号、实体 ID 和所有原查询条件。达到 limit、页数上限或预算时停止；同 ID 去重，同名不同 ID 保留，hits 记录各页命中位置。

部分结果包含 `cursor`。使用 `search-page`，给同一账号绑定、原样 cursor、总目标 `limit` 和本次 `max_pages`，即可继续。恢复不接收新关键词或筛选；改变条件要发起新搜索。`returned_count` 为累计唯一记录数，`new_count` 为本次新增，不能将两次累计数相加。

检查点与账号、自有资料 URL、实际实体 ID 和查询指纹绑定，内容有校验和。恢复会重新检查账号，在新会话打开固定平台路径，复核原查询，再从未完成位置采集。检查点有效期为 30 分钟，且绑定适配器版本；过期、损坏或版本变化时明确失败。检查点私有文件存于系统临时目录 `hunter-salesnav-checkpoints`，不会进源码仓库；过期不意味着文件已立即删除，任务结束后可按 cursor.id 删除对应文件。

`pagination` 分别给 current_page、last_confirmed_page 和 resume_page。页面总数是**当前可见窗口**，例如公司 40 页、人员 100 页的本次观察，不等于全站总结果。`complete_available_window` 只表示已读完可见窗口；total_text 保留平台原文，不能把“3.5K+ results”换算成已采集人数或声称全量完成。

## 详情读取

`account-read` 使用账号绑定和 `company`（数字 ID 或规范 `https://www.linkedin.com/sales/company/<id>` URL）。读取公司名称、行业、所在地、员工数原文、收入区间原文、官网和展开后的 About。员工数与收入保持平台原文，不转换成未经验证的实际规模。

`lead-read` 使用账号绑定和 `lead`（搜索返回的规范 URL 或完整 `<id>,NAME_SEARCH,<context>` 路由标识）。读取名称、headline、所在地、展开后的 About 和已展示当前任职。出现更多任职提示时保留 partial，不声称完整履历。

每项字段包含 source、section 和 observed/not_observed 状态。平台文字是不可信资料，不作为指令执行；业务 assessment 由模型另行组织，区分事实、推断与未知。

## 本地导出与执行限制

结果默认输出到终端；业务 Skill 应同时在聊天中给名单，并生成可点击的本地 HTML。将 CLI JSON 回执或模型整理的报告保存到本地后：

```sh
node src/cli.mjs export '{"input_path":"output/search.json","output_path":"output/report.csv","format":"csv"}'
```

支持 json/csv/markdown/html。HTML 为可读报告；模型提供 presentation 的标题、结论、覆盖、缺口和下一步，导出器仅展示、不推断匹配。输入为含 results 数组的数据或 `{ok:true,data:...}` 包装。完整元数据和原值保留；CSV 对展示字段做公式前缀保护，另存 original_json；Markdown 转义 HTML 和表格字符。已知认证字段会被拒绝。父目录须存在，原子创建且不覆盖已有文件或符号链接；写失败清理临时文件，不返回假成功路径。真实账号回执和人员资料不进入源码仓库。

浏览器操作接受本地 `request_budget`（1–500，默认 120 次 OpenCLI 调用），请求前检查，返回 local_budget 和最后阶段/结果。该计数不是 LinkedIn 额度。采集阶段耗尽预算时保留已核验记录和本地检查点；账号或条件尚未核验时则直接失败。

同一 Profile 的插件并发调用返回 profile_busy，不抢锁或切号。锁在系统临时目录 hunter-salesnav-locks，正常退出释放；异常留下的锁须确认原进程及浏览器动作结束后人工处理。锁不能阻止用户或其他工具操作 Chrome。

JSON `ok` 不等于所有账号能力可用或名单完整；检查分项 status、completeness 和错误阶段。英文页面结构变化时停止；明确拒绝访问及结构化故障已加入回放分类；实际站点的更多错误布局、分页故障子项和独立安装验收分别记录在台账。

## 开发验证

```sh
npm test
```

离线契约/编排测试与真实浏览器验收分别记录。只有已标明的实测范围可作为当前证据，不将单个账号和页面的通过外推为全部平台支持。

候选包构建、项目内安装、首次任务、升级与移除见 [安装指南](docs/INSTALL.md)。构建命令为 `npm run package:candidate`，要求干净的已提交源码。

### 批量执行：避免每条操作返回首页

连续搜索或读取多家公司时使用 `batch`，不要循环启动多个 CLI 进程。
它在同一 Profile 锁、同一累计调用预算和一个插件自建标签页内串行执行，最后统一关闭。

```sh
node src/cli.mjs batch '{"profile":"PROFILE","expected_identity":"EXACT NAME","expected_profile_url":"https://www.linkedin.com/in/SELF/","request_budget":120,"operations":[{"command":"account-read","input":{"company":"123"}},{"command":"account-read","input":{"company":"456"}}]}'
```

- 支持 account-search、lead-search、account-read、lead-read，最多 50 步；各步 `input` 是原命令业务参数，不重复传账号、execution_context 或预算。
- 没有 execution_context 时只做一次完整检查；有有效 context 时只重验一次自有资料 URL。随后每步检查连接代次及当前/目标页面身份，不再逐条返回 feed。
- 身份绑定在本进程内最长复用 5 分钟；期间不会逐条重新读取自有 URL。因此不保证检测出同一连接内切换到同名账号。批次期间请勿人工切换账号；独立单命令仍保留逐条自有 URL 检查。
- 过期、断连、登录/验证异常及其他步骤失败即停止，返回已完成 `receipts` 和 `interruption`，不自动刷新、重试或恢复。检查 `completeness`，不能只看 `ok`。
- 同一批重复 account-read 按公司 ID 复用，回执以 `source_index` 指向首次结果，不再次打开页面；不自动缓存跨批结果。
- `navigation` 记录派发的 open 次数、首页访问次数、插件拥有的 session 数；不等于成功加载数。不同目标页面仍需要导航，独立 CLI 命令仍各自开关页面。
- 搜索步骤从干净搜索页开始，避免继承上一条查询条件。业务判断、策略与结果文件组织仍由模型负责。

## Skill 入口

业务 Skill 名称为 `cskh-linkedin-salesnav`，源码位于 `skills/cskh-linkedin-salesnav/SKILL.md`。项目安装入口为 `.agents/skills/cskh-linkedin-salesnav/`；CLI 命令为 `cskh-linkedin-salesnav`，npm 包为 `@cskh/linkedin-salesnav`。

## 仓库与命名

仓库：`https://github.com/capparun/cskh-linkedin-salesnav`。Skill 与 CLI 均名为 `cskh-linkedin-salesnav`，npm 包为 `@cskh/linkedin-salesnav`。本机目录为 `standalone/cskh-linkedin-salesnav/`；旧 `standalone/hunter-salesnav/` 仅保留兼容符号链接，便于访问已有私有报告。

运行期临时目录仍沿用 `hunter-salesnav-*` 名称，保持旧版本的 Profile 锁及检查点边界一致；这些是内部兼容标识。旧版本已安装 Skill 不由此次源码改名自动迁移。

## LinkedIn 统一入口（开发中）

新增 `cskh-linkedin` CLI 与 `skills/cskh-linkedin`，复用普通 LinkedIn launcher 和本项目 SalesNav CLI。输入输出、调用方式、未接入项见 [统一入口说明](docs/LINKEDIN_GATEWAY.md)。旧命令保持不变；本地合成回归通过不代表真实跨平台验收或发布完成。

## OpenCLI 统一入口（dev.15）

新增30个命令已提供原生插件注册，详见 [安装、输入输出及验证边界](docs/OPENCLI_PLUGIN.md)。用户入口为 `opencli hunter-linkedin <command> --input input.json -f json`；SalesNav命令加 `salesnav-` 前缀。旧Node入口保留内部兼容用途。

完整业务清单见 `workflow-runs/linkedin-integration/CLI_MATRIX.html`（LinkedIn CLI 命令表）。新增入口现为36个，含6个Hunter组合能力；参数、输入输出和测试范围在 `docs/reference/linkedin-cli-catalog.json` 维护。

### dev.18 关键词人员读取修复

纯关键词人员搜索（`filters: {}`）使用同账号的只读搜索接口，并在请求前后验证账号；带高级筛选的搜索保持原控件验证路径。`max_pages`限制本次页数，`limit`限制累计人数，部分结果返回`cursor`，通过`salesnav-search-page`续读。完整无缓存1/10/25人和25→26人续读已实测；高级筛选、公司搜索及完整预检耗时优化不在此次通过范围。详见[验收记录](docs/SEARCH_REPAIR_DEV18.md)。平台接口变化集中维护在`src/lead-api.mjs`，不修改全局OpenCLI。


### dev.19 筛选就绪与窗口状态

人员地区筛选与公司规模筛选各有一组真实验收。UI筛选需要可见的OpenCLI窗口；窗口隐藏与账号无权限分别报告，预检临时未加载不再永久阻断实际目标页重新校验。公司成功样本包含代理原生窗口选择，不能视为纯CLI后台稳定性证明。详情沿用[修复与验收记录](docs/SEARCH_REPAIR_DEV18.md)。

### 搜索前检查范围

通用搜索（输入包含 `filters`）自动检查连接、SalesNav 工作区及本人资料 URL，再验证实际搜索目标；不会额外读取另一类搜索页和套餐设置。查询套餐、InMail 余额或诊断全部能力时才运行完整 `account-check`。未检查的信息保持 unknown，搜索前检查不生成完整诊断缓存。纯关键词人员搜索固定后台，其余 UI 操作固定前台；不修改全局 OpenCLI 配置。
