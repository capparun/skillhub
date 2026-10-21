# 猎聘 MCP / Skill 交接 — 2026-10-21 收尾版

本文件覆盖 `LIEPIN_HANDOFF_2026-10-21_CURRENT.md` 中的当前状态。历史文档和失败回执保留，不代表本版已上线。编写前重新核对本机安装、Git/PR、测试日志及真实收藏操作回执。

## 最新 Git 收口补充

- 持久干净工作树：`/Users/shawnruan/.codex/worktrees/liepin-final-acceptance/hunter-works`。
- 本地分支：`codex/liepin-final-fixes`；业务修复提交 **`e271bc77`**（6份源码/测试/Skill + 2份脱敏证据）。
- 本轮从该工作树重建128份包文件，指纹与已真机验证的fbd2d537完整一致。未重新操作账号。
- 旧补丁仍可复核，但接手不必再建树、再应用或重复提交；先检查此工作树最新git状态。
- PR #5远端仍9a970a71，本轮未推送。下一步审阅本地增量、按现有授权边界推进新提交的双平台CI；不合并/发布。
- 项目本地SOP（docs/workflow与scripts/build-workflow.py）不在9a970a71 Git基线中；只在原主工作区更新其猎聘事实并重建，不把整套未跟踪SOP混进本补丁。

## 1. 先读结论

| 项目 | 当前事实 |
| --- | --- |
| 目标 | 基于真实验收完成可复用猎聘 Skill：按确认需求寻找值得跟进的人、授权收藏、可视化交付，兼容 Windows/macOS |
| 技术路线 | opencli-mcp 官方 Site Adapter + 共享业务核心 + Hunter 兼容扩展；业务不依赖 CUA |
| 本轮修复 | 收藏弹层等待/选择、旧分组缓存误拒绝、收藏列表加载与导航、失败诊断、任务持久保存说明 |
| 本地回归 | 最终候选对应干净来源：核心391/391，MCP200/200 |
| 真实验收 | 一次搜索首页10条、2份部分可见详情；临时添加、独立组归属回读、取消、恢复原10位均有回执 |
| 外部效果 | 两次临时测试收藏都已取消；原10位保留；本轮创建的搜索/详情测试页已关闭，用户原首页保留 |
| GitHub | PR #5 OPEN，HEAD 9a970a71，未合并；本轮修复已本地提交e271bc77、尚未推送 |
| 发布 | 没有发布Zeabur、没有正式发布安装包；不具备整体完成/上线结论 |

**不要从头再搜、重复收藏或拆装扩展。** 下一步优先把已验证补丁纳入干净 Git 来源并核对剩余交付门。

## 2. 用户决定与安全边界

- 用户允许低频真实账号开发验收；不联系候选人、不索要附件、不解锁，不修改猎聘检测脚本。
- 保持兼容扩展启用，不反复切回官方版。没有更新扩展身份、权限或客户端全局MCP配置。
- 原任务数据确实丢失后，用户明确回复：**「没有，你重跑都行」**。因此独立重新验收；不是假装恢复旧任务。
- 原丢失任务曾批准累计上限125；没有清零或伪造其历史。新验收单独记录数据丢失事实和新授权原话。
- 新验收scope起初12笔是Agent自定开发配额，不是用户指定新上限；修复复验时调整到20并登记理由，全部20笔历史保留，无未确认写操作。
- 仅关闭本轮自己创建且核对过实际身份的页面，不碰用户原首页/其他产品页面。
- 浏览器动作日志应表述用户可见动作，区分计划、派发和回读。DOM读取不虚构点击。
- CUA本轮只用于查看Chrome扩展管理和后台日志；没有成为Skill业务依赖。
- Windows真机暂无；Claude Code客户端首次调用被用户暂缓；Zeabur登录核对也暂缓。不重复询问、不冒充通过。

## 3. 当前运行版本和路径

所有下列相对路径均相对 `/Users/shawnruan/coding-proj/hunter-works`。

| 项目 | 路径/值 |
| --- | --- |
| 产品版本 | 0.3.0，未正式发布候选 |
| 最新完整源码指纹 | `fbd2d537b08447aebf08586d333dd73aa824563e9fc3459204d614a8408dc2e8` |
| 安装根 | `.liepin-install-state/rerun-v030` |
| 安装版本 | 上述安装根的 `versions/<完整指纹>` |
| 安装回执 | `output/liepin-navigation-install.json` |
| 构建候选 | `output/liepin-group-navigation-evidence-candidate-20261021`，128份清单文件 |
| 干净来源快照 | `output/liepin-reviewed-source-20261021`，Git 9a970a71提取 + 6文件覆盖；不是Git工作树 |
| 来源覆盖清单 | 上述来源目录的 `overlay.json`，已更新最终文件哈希 |
| MCP启动命令 | 读取安装回执中的 `mcpServer.command/args`，不要抄旧临时路径 |
| 兼容扩展ID | `ebhhcfiikojppnmkimkhcajpieelbglb` |
| 扩展构建声明 | `hunter-0.3.0-alpha.1-e2d651db68b5e573dc153f1f7cb5d3f0643ad396eabd3de3dc9868dad773a015` |
| 上游 | opencli-mcp0.0.30 / 扩展0.0.22；Skill/包版本与扩展版本不同 |

本机Chrome实际加载的扩展路径（只读Preferences核对）仍为：

`.liepin-install-state/adapter-v030/browser/extension`

安装器另生成了rerun-v030/browser/extension，但没有因此在Chrome重复加载。实际扩展ID及声明已经通过浏览器界面和MCP运行时核对。

当前Native清单：

`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.opencli.mcp.json`

其中path指向：

`.liepin-install-state/rerun-v030/browser/hosts/<完整指纹>-0e493d5684a1/launcher`

通信升级备份（依序）：

- `rerun-v030/browser-registration-backup.json`：从旧6c候选升级到7a候选。
- `rerun-v030/readback-browser-registration-backup.json`：7a→a9。
- `rerun-v030/navigation-browser-registration-backup.json`：a9→最终fbd候选。

备份用于需要时的受控回滚，不要每轮自动恢复。`current.json`/安装doctor里的browserSetup仍为安装时静态待验字段，不能据此覆盖后续真实接入结果；独立真实回执也不等于所有客户端已验收。

## 4. Git来源与接手办法

根工作区main当前HEAD：`a98c5eb10ec783739526958f8ca7487b0b724f27`，混有很多其他产品变更；猎聘目录在该main下整体显示未跟踪。**禁止根目录 git add . / reset / clean / 整包部署。**

旧临时工作树已不存在，git worktree list标prunable：

- `/private/tmp/liepin-source-consolidation`，分支 `codex/liepin-source-consolidation`，提交9a970a71仍在Git对象中。
- `/private/tmp/liepin-ci-acceptance-current`，0e614b18。
- `/private/tmp/liepin-ci-acceptance-checkout`，ef2de196。

旧持久工作树 `.codex/worktrees/liepin-mcp-delivery/hunter-works` 是6f4266dc旧基线，不要整分支合入以免带回其他产品删除。

当前PR：[capparun/skillhub #5](https://github.com/capparun/skillhub/pull/5)

本次实时核对：OPEN、CLEAN、未合并，HEAD `9a970a713bc2460afcf73f587990e2098cf182ec`；Web/Server/Docs/Dependency Review成功，CodeQL按原条件SKIPPED，不写成通过。这些旧CI不覆盖本轮新修复。

### 已准备可应用补丁

`output/liepin-final-fixes-against-9a970a71.patch`

SHA256：`d31497ef48eb52a08d954c23b0bf0d219c8fb3339e4de29b5815d8bc15278119`

6个文件：

1. `distribution/liepin-search/runtime/packages/liepin/lib/favorite.js`
2. 同目录 `favorite-group.js`
3. 同目录 `favorites-list.js`
4. `distribution/liepin-search/runtime/packages/liepin/test/favorite.test.js`
5. 同测试目录 `favorites-list.test.js`
6. `tools/liepin-mcp/skill/hunter-liepin-mcp/SKILL.md`

建议下一会话在持久位置从9a970a71建立/恢复干净工作树，先 `git apply --check <补丁绝对路径>`，再应用、审阅。不要把output快照误当已提交的来源；补丁文件和覆盖清单不含简历。需要推送时按现有PR流程执行，先确认授权范围和本轮新增差异。

## 5. 本轮具体修复

### 收藏写入

从持久6c安装版找回原Claude未提交改动中可用的弹层等待、分组观察和受限选择重试；保留一次保存、选中未确认不保存、重复操作回执复用。

**没有恢复历史分组缺失提前拒绝**：历史列表没有时效/完整性证明，不能据此认定现在不存在。最终favorite-list仍保持9a基线实现，不导入旧knownFavoriteGroups负缓存逻辑。恢复材料在 `output/liepin-source-recovery-6c935e69`，只是历史恢复资料，不是最新产品真源。该目录的4项测试直接验证旧6c行为，不是最新全部回归。

### 收藏列表

- 导航最多32次观察，250ms间隔，就绪即退出；不是固定强制等待8秒，也不保证包含RPC延迟的总耗时8秒。
- 不重复点击“我的收藏”；blocked/wrong_page停止。
- 保留favorites-entry/target-group阶段、状态、计数等失败证据，不再把loading全部改写为requested_group_not_verified。
- 当其他分组的可见计数和总数不一致时，允许点击已观察到的准确目标组；目标组仍须独立核对名称、计数和行结果。
- 增加navigationEvidence便于证明是否实际命中该分支。最终成功真机回执该字段为null，因此不能断言计数不一致必然就是前两次loading的真实根因。

### Skill与数据

正式任务及scope、详情、报告必须有用户指定的持久私有位置，临时目录不能是唯一副本；不能进Git或安装包。缺失时先找备份，不猜造授权、身份和历史。

## 6. 真实验收：结果、失败与修正

持久私有目录：`.liepin-install-state/rerun-acceptance`（Git忽略）。

| 项目 | 真实结果 |
| --- | --- |
| 搜索 | 仅一次“伺服驱动”，首页10条；开发流程验收，不是完整因时JD正式寻访结论 |
| 详情 | 两份已保存，均partial，可见文字4215/3945；不称完整简历 |
| 分组基线 | 因时伺服控制10位，已保存稳定ID用于最终核对 |
| 第一次临时收藏 | 状态未收藏→添加成功→添加后组回读失败→取消成功→最终回读10位，原成员全保留 |
| 第二次临时收藏 | 未收藏→添加成功；等待修复候选a9读取仍loading；保留现场后用最终fbd继续只读核验，无第三次添加 |
| 最终添加后核验 | 目标组名正确、groupReadback=true、总数11、当前页10条，测试人选稳定ID在当前页 |
| 最终取消 | saved=false，回读恢复10位，原10位全保留，测试人选不在组内 |
| 页面清理 | 本轮搜索/测试详情关闭；用户原猎聘首页保留 |

验收脚本曾错误要求11人全部出现在同一页，导致输出partial。现场页面每页10条，正确判据是：添加后目标组总数+1且测试ID出现；取消后原10位完整恢复。原partial回执保留，未伪造改写；以原始操作回执另做审计修正，不为改结论重复写入。

### 可靠证据入口

- `workflow-runs/liepin-servo-diagnostic-20261021/favorite-cycle-final-audit.json`：最终组归属及恢复审计。
- 同目录 `rerun-live-acceptance.json`：第一次重跑分项记录，保留中间缺口，不能当最终状态。
- 同目录 `resume-blockers.md`：按时间追加的现场因果链，后文覆盖旧判断。
- 同目录 `ledger-recovery-audit.json`：丢失账本查找范围。
- 私有task.json：完整操作、可见简历、事件和稳定ID；scope.json：共享计数。不要输出/提交私有全文。
- 私有 `navigation-retest-summary.json`：原partial脚本结果；正确审计另见final-audit。

不要再执行私有search.mjs、favorite-cycle*.mjs、cleanup.mjs等整段脚本：它们多为一次性恢复脚本，重复执行会拒绝或无意义。接手先读取账本。

## 7. 本地测试与已知边界

最终来源快照执行结果：

| 测试 | 结果 | 日志（output/liepin-reviewed-source-20261021下） |
| --- | --- | --- |
| 核心 | 391/391 | navigation-core-tests.tap |
| MCP | 200/200 | navigation-mcp-tests.tap |
| 收藏读取定向 | 26/26 | 历史恢复目录root-count-after.tap |

最终包128份清单文件与来源快照存在的同名文件哈希重新比对无差异；来源覆盖清单已刷新。包指纹不是tar包SHA，不能拿去比install脚本。

干净目录首次缺锁定依赖时有3项失败；通过npm ci --ignore-scripts安装后复验通过。离线缺ws缓存/沙箱DNS失败有记录，不跳过检查、不把失败归因业务或杀软。根工作区回归不等于干净候选回归；这里391/200为最终来源快照实跑。

历史PR双平台CI曾成功，但不是最终fbd候选的双平台结果。Windows真实Chrome/Native Messaging/首次业务从未补齐。不要把macOS真机、Windows注入契约或旧CI替代新候选全平台证明。

另有未改的接口局限：`readFavorites(afterOperationId)`要求同组回执payload.group，direct favorite remove的payload不带group。因此本轮取消后使用独立精确分组读取，不把remove ID传afterOperationId。是否修该契约应单独加测试与验收，不在交接时静默修改。

## 8. 连接排错：重要纠正

此前反复误报host_unavailable，**不能再要求用户反复开Chrome/重装扩展**。

实际核对：扩展管理显示Hunter兼容版开启、官方opencli-mcp关闭；后台日志host0.0.30 ready。同一MCP元数据调用在沙箱内失败，在获准沙箱外成功。

- 使用可访问本机通信通道的执行环境，再核对是否真断连。
- `sites.run('liepin','tabs',{})`只列适用搜索/详情等标签；只有首页时返回[]，不代表宿主断开。
- 必要时独立读取browser.user.openTabs与运行时manifest，元数据成功是连接证据，不等于业务通过。
- 扩展图标没有本会话先前假定的连接面板；不要继续让用户找不存在的重连按钮。
- Native升级只更新固定宿主，保留通信备份与扩展身份。已加载的旧host不会仅因改清单就自动换版；本轮核对精确进程后退出旧host，让原扩展重连，没有循环拆装。
- 上述执行环境诊断不构成绕过站点安全检查；不修改检测脚本，不承诺零风控。

## 9. 下一步顺序（按效率）

1. 读取本文件、项目SOP、当前Skill、最终审计和私有task简要状态。不要重复跑已结束脚本。
2. 在持久干净Git工作树应用已生成的6文件补丁，审阅来源与测试；按最终源码重建指纹应一致。包含新变更时再跑适用检查，不重做真实搜索/收藏来“证明还在”。
3. 更新产品状态/需求矩阵，逐项区分历史能力验收、最终候选验收与明确暂缓门；本轮只收口收藏缺口，不宣称PRD全部功能同版重验。
4. 本轮补丁推到PR后再跑对应Windows/macOS CI；旧PR绿灯不覆盖新补丁。不要擅自合并/上线。
5. 仍缺用户此前暂缓条件：Windows真机、目标客户端首次调用、Zeabur维护入口只读核对。明确留项；若用户要改变交付边界，先记录决定。
6. 满足全部上线门后再写表格形式上线申请，**上线范围放最上**，列Git来源/修改范围/测试/上线步骤/回滚，用户最后确认。现阶段不要建议正式上线。

发布遵循根AGENTS：整站部署仅 `scripts/deploy-zeabur.sh`；不从GitHub新建Zeabur服务、不用无Git绑定的service redeploy；仅包发布必须核实现有维护通道。不要从脏main上传整站。

## 10. 给下一位Agent的一段话

> 收藏技术闭环已经有真实回执，不要再添加/取消测试人选。最新运行候选是fbd2d537…，391核心+200MCP通过；当前PR仍停在9a970a71，本轮修复已在持久工作树本地提交e271bc77，output补丁仍保留，未推送。旧/tmp账本确实丢失，用户允许独立重跑，新账本在项目Git忽略的持久目录，20笔全保留，原10位已恢复。连接误报已证实与执行沙箱有关，不要再折腾扩展开关。先把来源/PR/剩余门收口，不把局部通过写成整体上线。
