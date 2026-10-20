# 开发候选安装、升级与回滚

尚未发布。macOS已验证隔离安装、13个Adapter注册、持久兼容宿主连接及真实猎聘分项业务。Windows真机及目标AI客户端首次业务仍未完成，不把macOS结果外推为跨平台验收。

## 推荐入口：已解压的候选包

需要Node.js 22+、Chrome，以及可写的持久目录。在候选包根目录运行（替换大写占位符；Mac和Windows均使用Node命令）：

```text
node install.mjs --root "INSTALL_ROOT" --skills-dir "SKILL_PARENT"
node doctor.mjs --root "INSTALL_ROOT"
```

`SKILL_PARENT`是本次助手的Skill父目录，安装器只写入其中的`hunter-liepin-mcp`子目录，不给所有助手自动安装。回执提供持久扩展目录、预期扩展ID、`assetsFile`、`mcpServer`和`localCommand`。安装成功只代表本地组件准备完成；继续按下文加载扩展、审阅通信接入计划并配置一个MCP服务。不要再重复执行下文底层安装步骤，也不要把下载的临时目录当成安装根。

已有依赖缓存且registry一致时可显式使用`--offline`；离线缓存未命中不等于网络或组件已损坏。安装与更新使用同一明确的npm registry，不混用缓存键。安装包的SHA256、包内源码指纹和脚本文件哈希属于不同对象，校验前先确认对象。

## 浏览器与助手接入（底层开发入口）

本流程不要求先全局安装或注册官方 opencli-mcp。需要 Node.js 22+、Chrome、已校验的候选目录，以及用户在 Chrome 登录猎聘。源码与原始简历分开保存。当前入口已经实现，但目标系统/客户端实测状态仍以下表与对应证据为准，不能仅凭生成文件宣称安装成功。

1. 若已经运行上面的install.mjs，跳过本步并使用回执的assetsFile；否则可在源码开发环境手动安装并准备包内运行时：

```text
node tools/liepin-mcp/scripts/install-package.mjs install "INSTALL_ROOT" "CANDIDATE_DIR" SOURCE_FINGERPRINT
node tools/liepin-mcp/scripts/install-package.mjs select "INSTALL_ROOT" SOURCE_FINGERPRINT
node tools/liepin-mcp/scripts/prepare-adapter-runtime.mjs "VERSION_DIR"
node tools/liepin-mcp/scripts/prepare-browser.mjs "VERSION_DIR" "BROWSER_ROOT" "ASSETS.json"
```

`VERSION_DIR` 来自安装结果的 directory；`BROWSER_ROOT` 使用稳定的用户目录，不放在系统临时目录或即将删除的源码目录。生成内容包括：固定 extension 目录、分版本宿主、公开固定扩展ID、客户端配置和Skill目录。固定ID是正常的公开Chrome扩展身份，不是隐藏指纹措施；不保存私钥、不增加上游权限。

2. 在 Chrome 扩展管理中加载返回的 extension 目录，核对实际ID与 ASSETS.json 中 expectedExtensionId 完全一致。现有客户仅保留这一份兼容扩展启用；不要同时启用多份 opencli-mcp 扩展。此工具不自动安装、启用或卸载浏览器扩展。

3. 用实际ID生成、审阅接入计划，再明确应用：

```text
node tools/liepin-mcp/scripts/browser-setup.mjs plan "ASSETS.json" ACTUAL_CHROME_EXTENSION_ID "PLAN.json"
node tools/liepin-mcp/scripts/browser-setup.mjs apply "PLAN.json" "ROLLBACK.json"
```

计划绑定候选指纹和启动器哈希。首次接入创建 Chrome Native Messaging 清单；升级保留已有 origin 与其他设置。macOS 写用户 Library 下的清单，Windows 同时登记 HKCU 的 Chrome native-host 默认值，不需要管理员权限。备份在修改前保存；预览后文件/注册表/运行时变化则停止。Windows 实现使用系统 Windows PowerShell 的注册表API，目前仍需 Windows 本机验收。

4. 按 ASSETS.json 的 mcpServer 在目标客户端配置一个 `opencli-mcp` 服务；它使用 Node 绝对路径＋参数数组，不依赖 Windows `.cmd` 的 shell 处理。备份并替换原同名服务，不额外增加一个 Hunter 业务 MCP。按客户端方式导入 skillDirectory。工具不会自动覆盖任何全局客户端配置。

5. 扩展/客户端重新连接后，用官方 Site Adapter `tabs` 与 `bind` 验证既有猎聘页，再执行一条明确批准的业务任务。文件生成、stdio initialize、Chrome连接与真实业务是四个不同层级的验收。

升级时再次准备新 VERSION_DIR，但沿用 BROWSER_ROOT；若扩展字节未变则原目录复用，不生成多份扩展。宿主按候选版本生成，接入计划明确指向新版本，浏览器重新连接后再核对。若扩展内容变化或已有文件被修改，准备器停止而不覆盖，需单独核对升级计划。

回滚通信配置：

```text
node tools/liepin-mcp/scripts/browser-setup.mjs restore "ROLLBACK.json"
```

首次接入回滚移除自己创建且未被改动的清单；升级回滚恢复原始清单字节与Windows注册信息。后续第三方改动会阻止回滚，不覆盖他人配置。旧版本目录、回滚收据与客户端原配置应保留；客户端配置和扩展开关由用户按已确认方案切回。回滚通信文件成功不等于正在运行的浏览器已切换。

## 双平台支持要求

Windows 与 macOS 均为本版必需支持的平台。包内清单统一使用 `/`，本机文件路径由 Node 转换；启动使用 Node 的绝对路径及参数数组，不依赖 Bash。路径包含空格或中文时，终端命令中的路径参数必须加引号。Windows 权限与 Native Messaging 注册必须按 Windows 机制验收，不能用 macOS 的文件模式位或注册位置代替。

| 验收项 | macOS | Windows |
| --- | --- | --- |
| 隔离安装、依赖解析、固定入口启动、版本切换 | 临时目录实测通过 | 待真机验证 |
| 含空格与中文的安装路径 | 临时目录安装、选择、固定入口诊断通过 | 待真机验证 |
| Native Messaging、兼容扩展、新客户端连接 | 固定ID扩展加载、持久宿主接入与实际MCP连接通过；目标客户端首次任务仍待验 | 待真机验证 |
| 猎聘业务端到端 | 搜索/列表/连续详情、30参数、方案闭环及收藏列表已有分项真机证据；完整交付仍待验 | 待真机验证 |

以上未验证项不能标记为已支持或已通过。

## 准备

需要Node.js 22及配套npm、候选源码目录、与该候选对应的可信发布清单指纹。指纹校验对象是候选清单及其文件，不是install脚本。安装根目录使用个人可写的新目录，不要选择现有客户端配置目录。

## 安装与启动配置

在候选目录运行（将大写占位符替换为实际路径/指纹）：

```sh
node tools/liepin-mcp/scripts/install-package.mjs install "INSTALL_ROOT" "CANDIDATE_DIR" SOURCE_FINGERPRINT
node tools/liepin-mcp/scripts/install-package.mjs select "INSTALL_ROOT" SOURCE_FINGERPRINT
```

第一步按指纹建立独立versions目录，逐文件校验、固定registry执行npm ci、禁用安装脚本，再验证包内MCP依赖。失败留下failed收据，不修改当前选择。安装锁存在时停止，不自动抢锁。网络问题修复后先检查failed目录；当前不自动删除或覆盖失败目录，使用新的安装根目录验收或人工清理本次失败目录。

第二步仅写INSTALL_ROOT/current.json及固定launch.mjs，不改任何客户端全局配置。Site Adapter 包的 current.json 返回 localCommand，不能作为 MCP 服务配置导入。browserSetup=pending 表示浏览器部分尚未安装就绪；原型包才会返回旧 mcpServers。

本地工具使用 `node INSTALL_ROOT/launch.mjs conditions` 或 `node INSTALL_ROOT/launch.mjs task INPUT.json`。版本选择在下次调用生效；浏览器使用官方 opencli-mcp，其 Adapter 注册与兼容运行时需要另行完成，不能把 local launch.mjs 配成 MCP 服务。

## 升级与回滚

本地任务工具升级：在同一安装根目录 install 新候选，成功后 select 新指纹；旧版本保留。回滚本地工具：select 此前 ready 版本的指纹。切换前重新校验源码与包内依赖，不允许选用 failed 版本。实际数据任务文件不放在版本目录中。

**select 只切换本地任务工具，不会切换正在运行的浏览器 Native Host。** 浏览器升级或回滚还必须核对 Native Messaging 指向的运行时版本、对应兼容补丁、扩展和客户端连接。当前尚无已验收的一键浏览器升级/回滚流程，不得仅凭 select 成功宣称整体回滚完成。

## 接入浏览器前

本地 doctor 成功只表示本地依赖就绪。Native Messaging注册、固定兼容扩展、实际连接构建、客户端协议及猎聘业务需要各自验证。此安装器没有执行setup、没有加载扩展，也不会通过修改全局PATH解决连接问题。

2026-10-20 临时兼容扩展的自有合成页测试通过（打开子页、读取、关闭返回、滚动、按键）。随后发现并修复官方 executor 漏传兼容接口，修复后的 68f993da 候选已完成猎聘一次搜索、3条列表和2份详情验收，尚未覆盖全部功能。不要把这份开发安装说明当成正式客户安装入口。


## 兼容副本通信白名单（开发验收）

以下旧版白名单工具仅适用于已经完成官方注册的开发机器；新机器请使用上方独立接入流程。前提是官方 launcher 路径有效。这里不调用官方 setup，不替换 launcher、不编辑客户端配置或 Windows 注册表；不能代替新机器首次注册。加载副本后，从扩展管理页读取实际 ID，不能根据名称猜 ID。

- macOS Chrome 的现有配置通常在 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.opencli.mcp.json`；自定义用户数据目录应以该浏览器实际使用的配置为准。
- Windows Chrome 的实际 manifest 位置由 `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.opencli.mcp` 的默认值指向；不要仅凭默认目录猜测，也不要覆盖其他浏览器的注册。

以下命令在已明确允许接入该副本时使用。所有路径带引号；`RECEIPT` 是尚不存在的备份文件，目录需已存在。

```text
node tools/liepin-mcp/scripts/native-access.mjs plan "MANIFEST" EXTENSION_ID
node tools/liepin-mcp/scripts/native-access.mjs apply "MANIFEST" EXTENSION_ID "RECEIPT"
node tools/liepin-mcp/scripts/native-access.mjs restore "RECEIPT"
```

plan 只读；apply 先持久保存原始字节，再添加一个精确扩展 origin，保留官方 origin、路径和其余字段。restore 仅在当前内容仍等于本次写入时恢复；发现后续变化会停止，避免覆盖其他任务的配置。重复恢复原文件不会再次修改。开发验收期间按用户确认保持兼容环境，官方原版作为回退备份；仅在明确回退或结束整个兼容环境使用时恢复，不在每个子用例后拆装。

上述 plan/apply 白名单模式不更改 host 路径，单独使用不能接入隔离 Adapter 运行时。2026-10-20 开发验收另用临时脚本备份并切换了实际 manifest 路径与 origin，测试后逐字节恢复；该操作不是正式跨平台安装器。Windows 注册表定位与浏览器启动链仍需真实系统验收。


## Skill 使用说明

候选包内 `tools/liepin-mcp/skill/hunter-liepin-mcp/` 是独立 Skill 目录，包含 SKILL.md 与 references/workflow.md。客户端已接入官方 opencli-mcp 并注册猎聘 Site Adapter 后，可按该客户端支持的方式导入此目录。此安装器不会自动复制到全局 Skills 目录。Skill 本身不安装或启动扩展，不替代 MCP 连接配置；Claude Code 与 WorkBuddy 的实际导入、工具发现及业务链需分别验收。

## 隔离 Adapter 运行时准备与核对

在项目根目录使用以下命令，VERSION_DIR 为已安装候选的绝对版本目录：

```text
node tools/liepin-mcp/scripts/prepare-adapter-runtime.mjs "VERSION_DIR"
node tools/liepin-mcp/scripts/verify-prepared-runtime.mjs "VERSION_DIR"
```

准备操作只允许修改该候选内部的官方 0.0.30 依赖，按固定源码哈希应用 runtime 和 executor 两部分补丁，并注册 12 个 Adapter。已有准备回执时不会重复覆盖。验证器检查补丁及 Adapter 文件完整性，但不证明 Chrome 当前加载该候选，也不自动切换 Native Host。

跨平台本地验收命令：

```text
node tools/liepin-mcp/scripts/verify-platform-install.mjs "RESULT.json"
```

该命令实际安装依赖并验证安装后的执行器传参；`browserVerified:false` 表示不包含浏览器业务。Windows 必须在 Windows 上运行并保留结果，不以 macOS 结果替代。

## 可视化平台结果

本地 `report` 的 HTML 默认输出平台工作台：候选人主表、可展开详情栏目、搜索条件和动作日志。未关联身份的列表记录仍显示，不按姓名合并。评估交付使用输入字段 `"view":"evaluation"`：先展示结论摘要、已有评估的重点证据与缺口及下一步；未评估人选只汇总数量，完整简历和采集记录保留在附录。它仅摘要已保存的当前评估，不新增适岗评分或推荐排序。JSON/CSV/Markdown 导出行为保持原样。平台页按明确独立时间段拆分经历记录，保留原文；没有可靠时间边界时不猜测结构。搜索条件展示请求值与保存的执行证据值。

HTML 平台结果支持本地列表文本搜索、详情已读/仅列表筛选和每页10人的分页。这些控件不访问猎聘；关闭脚本时仍可阅读全部记录和手动展开详情。收藏快照区分成功读取为空与尚未读取，且失败读取不覆盖上次成功结果。

## 已注册浏览器的运行时切换（开发工具）

已验证运行时及其启动器准备完毕后，可显式切换现有 manifest。此工具不生成启动器、不注册 Windows 注册表、不加载扩展，不是首次安装闭环。启动器必须是本机绝对路径的普通文件，macOS还必须可执行；调用前需核对其候选指纹。仅检查文件并不证明它能启动。

```text
node tools/liepin-mcp/scripts/native-access.mjs plan-runtime "MANIFEST" EXTENSION_ID "LAUNCHER"
node tools/liepin-mcp/scripts/native-access.mjs apply-runtime "MANIFEST" EXTENSION_ID "NEW_RECEIPT" "LAUNCHER"
node tools/liepin-mcp/scripts/native-access.mjs restore "NEW_RECEIPT"
```

plan-runtime不写配置。apply-runtime保留原origin和其他字段，先保存原始字节，再同时切换路径与添加精确origin；恢复时若配置已有其他改动则停止。每次切换使用新回执，按后进先出恢复。当前只通过临时配置测试，Windows真实启动链和现用浏览器切换尚未验收。

## 生成绑定候选的启动器

```text
node tools/liepin-mcp/scripts/build-native-launcher.mjs "VERSION_DIR" "NEW_OUTPUT_DIR"
```

输出目录必须不存在。生成过程验证候选及已准备的Adapter文件；启动时再次核对候选指纹与运行时回执。macOS输出可执行launcher，Windows输出launcher.cmd。显式stdio参数启动MCP客户端服务，其余Chrome传入参数走官方host入口。Node路径固定为生成时的可执行文件，移动Node后须重新生成。

生成本身不写Native Messaging、不加载扩展。macOS已验证真实启动器的initialize协议响应为官方opencli-mcp 0.0.30；Windows脚本生成仅有离线测试，Chrome实际拉起host仍待验。输出目录含路径信息，请留在个人可写位置。

## 新机器首次注册：官方机制与影响范围

已核对固定依赖opencli-mcp 0.0.30的`dist/src/host/registration.js`及`setup.js`：macOS写NativeMessagingHosts目录，Windows写manifest并登记HKCU下Chrome的NativeMessagingHosts默认值。优先使用官方机制建立基础注册，随后使用本包的可恢复切换接入候选。

在**确认此前没有需要保留的注册**后，首次注册命令形式为：

```text
node "VERSION_DIR/node_modules/opencli-mcp/dist/src/main.js" setup --browsers chrome --clients none --no-open
```

这不是只读检查。`--clients none`避免修改Agent客户端配置，`--no-open`避免自动打开页面；官方代码仍会扫描运行中的自定义浏览器资料目录并写入对应注册，且生成共享官方launcher。执行前须检查目标路径及备份既有注册；已安装机器优先使用前述plan-runtime/apply-runtime，不直接重跑setup覆盖配置。WorkBuddy不是官方setup的自动客户端选项，后续须按其实际MCP配置界面接入并验收。

首次注册完成也不代表猎聘就绪：还须加载固定兼容扩展、核对实际ID、切换到本包生成的启动器、验证连接构建及首次业务。此路径尚未在干净Windows/macOS环境验收，不作为正式一键安装承诺。

## 首次任务的输入与可见结果

| 环节 | 用户输入 | 应当看到的结果 | 不能据此认定 |
| --- | --- | --- | --- |
| 本地诊断 | 固定本地启动器 conditions / doctor | 30个筛选字段、包与依赖检查 | 浏览器已连接 |
| 连接核对 | 让Agent列出现有猎聘标签并绑定准确URL | 当前页面与版本核对；不关闭用户标签 | 搜索业务已通过 |
| 试搜 | 岗位要求、关键词、明确筛选范围及本次收藏目标分组（可选不收藏） | 筛选回读、首页结构化列表及来源 | 全部简历详情已获取 |
| 详情 | 列表中指定人选和数量 | 可见全文、栏目、受限/未展开说明、可视化报告 | 已解锁或已下载附件 |
| 搜索方案 | 已提交的非关键词条件摘要、方案名称 | 保存且订阅状态明确；应用会触发真实查询 | 仅有关键词一定能保存 |
| 收藏 | 明确人选、明确现有分组和动作 | 收藏状态回读，取消只针对已授权的本轮新增 | 可以猜选分组或取消既有收藏 |

多分组且无默认选中时，先确定目标组；“未分组”也是一个明确选择，不把它冒充页面已选默认项。

## 网站安装命令对应的客户入口

Site Adapter安装包根现在提供install.mjs和doctor.mjs，接收现有网站安装路由传入的product/version/server/update-credential；PowerShell的npm-registry/offline也会传到同一npm调用。手动安装可用以下跨平台命令（路径加引号）：

```text
node install.mjs --product liepin-search --version VERSION --state-dir "STATE_ROOT" --skills-dir "AGENT_SKILLS_ROOT"
node doctor.mjs
```

默认使用用户持久状态目录，支持显式state-dir/skills-dir及现有agent/project-dir选择方式。安装包从临时目录解压也会把运行时、Skill和浏览器资产落在持久目录；回执返回实际路径和Node客户端参数。既有其他产品及旧CLI安装记录不覆盖。更新凭据仅保存在本机私有文件，不输出令牌。

本步骤只完成本地组件和生成配置；不加载扩展、不登记Native Messaging、不修改Agent全局配置。按回执继续加载同一固定身份扩展、核对实际ID、plan/apply接入、配置客户端并验证首次任务。doctor本地通过不能替代这些步骤。回执给出installed directory，后续脱离原解压目录检查可运行其doctor.mjs并传--root安装根。

同版本重跑先验证现有准备文件，不覆盖失败版本或未知同名Skill；旧Skill备份保留供恢复。新版本在相同安装根建立独立version目录，本地选择在准备成功后更新；浏览器升级/回滚仍走独立接入计划和收据。Windows原生完整安装仍需真机核验，不能用Mac通过替代。

### 分发站候选归档（开发者）

旧的`scripts/build-liepin-release.mjs`用于CLI插件，不能用来生成MCP包。先完成`build-package.mjs <候选目录> site-adapter`，再执行：

```text
node tools/liepin-mcp/scripts/build-distribution-archive.mjs <候选目录> <sourceFingerprint> <私有输出目录>
```

它只收录manifest声明且逐文件校验通过的文件，要求包根install.mjs/doctor.mjs，输出网站约定的tar.gz及外部JSON。外部SHA-256校验tar.gz；sourceFingerprint核对内部源码清单，两者不是同一对象。当前入口只允许未批准的预发布候选，禁止写入public，不上传、不改数据库、不发布；正式版本需完成验收及上线申请后另行固定，不能直接改名。

### 升级后确认实际运行版本

Native Messaging 清单更新后，Chrome 已启动的旧宿主可能仍继续运行；新 stdio 命令会代理到该旧进程。因此“安装目录、current.json 和客户端命令均已更新”只证明文件选择完成，不能证明新 Adapter 已投入运行。

先确认没有执行中或结果未知的业务操作，再在同一兼容扩展面板进行一次重连，让 Chrome 根据新清单启动宿主。保持同一扩展启用，不反复移除、安装或切换官方版。重连后重新检查连接与实际 Adapter 能力；旧版不认识新增参数时先核对宿主，不重复提交业务请求。原生通信回滚收据和旧版本目录应保留。

绑定测试页面时，复用用户实际打开的页面。通用 MCP 浏览器会话及其中的 Chrome tabs.create 会给新标签登记会话所有权，不能再把它当作未绑定用户页面交给另一个 Site Adapter 会话；不要为使测试通过而放宽跨会话隔离规则。

## 离线准备正式版本候选（开发维护）

从干净交付提交运行 `node tools/liepin-mcp/scripts/build-package.mjs <私有新目录> site-adapter 0.3.0`，可生成正式版本号的待审候选。版本需与最终上线申请一致；默认不传版本时仍构建 `0.3.0-alpha.1`。构建器只调整包自身版本元数据，不升级锁定依赖。

使用 `build-distribution-archive.mjs <候选目录> <指纹> <私有归档目录>` 打包；归档验证 manifest/package/lock 的版本一致、受哈希校验的文件和安装入口。正式版本候选仍是 `release-candidate-not-approved`、`approved:false`、`published:false`，禁止写入项目公开目录。生成制品不代表发布批准；需完成验收、最终申请确认和现有发布守卫，才能上传或发布。
