# 工具流程与参数约定

浏览器名称为 liepin Site Adapter 命令，调用前通过官方 sites 发现实际 schema。本地命令运行 `node <包目录>/tools/liepin-mcp/local.mjs <命令> <JSON文件或 ->`；conditions/doctor 无需输入文件。任务和输出路径使用当前操作系统的绝对路径，不复用他人的示例路径。

## 1. 需求与轮次（本地）

完整流程用 本地 `task`，mode=`init`，input 包含 title、criteria、rounds。本地 `create` 仅创建简易任务，不替代完整需求计划。已有任务不能重复初始化。

最小计划示例（只说明结构，关键词、数量和评估条件由实际需求决定）：

```json
{
  "title": "嵌入式开发工程师",
  "criteria": [{"id":"embedded","label":"嵌入式项目经验","category":"skills","kind":"required","weight":1}],
  "rounds": [{"id":"trial-1","phase":"trial","filters":{"keyword":"嵌入式开发","pages":1,"limit":10}}]
}
```

criteria.category：skills/experience/qualification/responsibilities；kind：required/bonus/exclusion。保持原文依据和待确认事项，不擅自补充要求。用 本地 `conditions` 获取全部筛选字段及类型，轮次还支持 pages/limit；不要发明字段。

相同账号复用现有站点 scope。首次创建使用 task(mode=`scope-init`, file=scope绝对路径, input={label,maxOperations,confirmedAt})，再 task(mode=`scope-bind`, file=任务路径, input={scopeFile})。额度是任务控制，不是安全访问频率。

获得范围授权后，用 task(mode=`approve`, input={roundId,confirmedAt,scope})批准轮次。读取 `brief` 确认需求与轮次状态。confirmedAt 是真实授权时间，不因工具报错而伪造新的确认。

## 搜索前的收藏分组选择

在首轮搜索之前，与需求确认一起询问本次目标分组列表。示例：

> 本次找到的人选，后续需要加入哪些收藏分组？已知现有分组为：未分组、组A、组B。请选择目标，也可以选择本次不收藏。

示例名称不可冒充真实账号分组。已知现有列表则展示实际名称；未知时请用户提供，或只读查看分组。不要为列组而打开候选人详情。

用现有任务授权记录保存用户选择、确认时间和适用范围（approve/grant的scope包含这些信息），继续任务先复用历史，不反复问。多个组需明确对应人选，不能自动给全部结果逐组收藏。分组选择不等于批量收藏授权；实际写入前仍核对该人选、分组和数量。新建组另按明确授权执行。未选不能默认“未分组”；明确不收藏则继续正常搜索与报告。

## 2. 页面、搜索与试搜复核

1. 本地 doctor 检查依赖，不能证明浏览器已连接。
2. 已有页面先 Adapter tabs 读取元数据，再 bind({file,tab_id,expected_url}) 核对并认领指定页面；不关闭用户页。没有适用页面时才 Adapter connect 使用 file/operation_id，需授权 inspect 请求 payload={view:"adapter-search-connect",url:"https://h.liepin.com/search/getConditionItem"}。返回实际 Adapter tabId；只验证地址，不证明登录。已有绑定可复用，禁止反复 connect 恢复白屏。
3. 首次search前已完成上节分组选择（含明确“不收藏”）；后续轮次复用选择。search 输入 file、round_id、tab_id。逐页结果会保存，后续 results 可读取当前页而不重新搜索；results 需要独立已授权 operation_id。
4. task(mode=`trial-quality`)读取试搜质量，再用 review 保存真实复核结论；需要调整时用 revise 提出新轮次。正式 full 轮次需当前试搜复核允许继续，不能直接跳过。

单独 prepare 输入 file、operation_id、tab_id、filters。授权请求的 kind 为 prepare，payload={page:tab_id,filters}；记录授权时需与实际调用值一致。

设置后回读失败时，可调用同一 `prepare` 并传 `verify_only:true`，读取指定 filters 的当前值和已选摘要。此模式不清空、不点击、不搜索，不修改任务或操作状态，暂停任务也可诊断。返回的 `committed` 与 `selectedSummary` 是独立证据；若两者矛盾，保留差异定位观察器，不重复点击，也不自动把原操作标记成功。省略此参数仍是设置流程。

## 3. 列表复核与多条详情

每轮保存列表后逐条记录处理结果：进入详情队列、已读详情，或明确无关而跳过（附职位相关理由）。相关但信息不足也进入队列；不得把未读取等同不匹配。不得固定只取前3份，也不依据姓名、年龄等决定读取顺序。复用已保存详情，按实际核实需要和现有授权确定队列；超出授权先明确剩余项，不追加未获准的操作。页面已变化时按下文恢复规则处理，不能按旧序号点击。

搜索关键词先形成假设，再用本轮覆盖和噪声来源修订；正式寻访的停止条件由用户目标和已确认范围决定，不以生成报告或耗尽开发验收配额代替完成。

## 3.1 多条详情执行

用 task(mode=`detail-targets`)读取已保存观察及缺口。优先使用观察 ID，不依据遮罩姓名猜测候选人。先创建持久队列：

```text
local task: {file,mode:"detail-batch",input:{id,page:tab_id,observationIds:[实际观察ID...]}}
```

创建是本地操作，不自动授权。返回 allowedRequests；在用户授权已覆盖这些实际详情时，将这些原样请求交给 task(mode=`grant`,input={allowedRequests,confirmedAt,scope})。任务必须已有 policy，站点 scope 也需有余量。没有 policy 时使用 task(mode=`authorize`)记录首次明确范围及请求，不通过重复创建 scope 增加预算。

继续同一队列：Adapter `detail-batch({file,id,tab_id,interval_ms:3000})`。间隔按业务场景调整，参数不代表平台安全保证。为适配官方单次执行时限，每次调用最多读取一份新的详情并保存进度；返回 status=pending 且 yieldReason=invocation_item_limit 时，继续调用相同 file/id/tab_id，直至 completed。不得新建批次或更换操作ID。跨调用仍保持条目间隔。队列跳过已完成项；paused 或异常时先核对任务，不自动循环重试。搜索换页后旧卡片不可直接点击，先确认来源页和当前卡片；恢复搜索仍按单独授权请求执行。

Adapter `open-detail` 用于单条持久观察；Adapter `current-detail` 用于已打开且身份核对的详情。读取后核对 saved/partial/缺字段、原文长度、来源及简历 ID，而非只看工具 exit 0。

## 4. 评估、名单与报告

task(mode=`evaluate`)的每条 finding 对应 criterionId，status 为 supported/contradicted/unknown；引用使用保存 observation 的 hash、字段 path 数组、原文 quote，禁止捏造引文。未知项保持 unknown。

rank 保存人工复核顺序及依据。shortlist 区分 preliminary 与 final；需要深读时先完成详情及复评再形成最终名单。证据变化后旧评估不能直接沿用。可用 task(mode=`show`)检查最新证据和历史记录。

report 输入 file、output、format（html/json/csv/markdown），只读本地任务。评估交付选 `view:"evaluation"`，正文呈现结论摘要、有效评估的重点证据/缺口与下一步；未评估人选汇总数量，不当成不匹配；完整简历保存在独立详情HTML，原始记录保存在独立JSON。引用摘录标识省略，不改原始资料；需求或证据过期时不复用旧结论。核对顶部统计、人数、证据对应、详情链接、原始文件保真和320/390窄屏。平台工作台仍检查筛选、分页及详情交互。仅生成文件不能声称视觉验收通过。

## 5. 收藏闭环与恢复

用户目标包含收藏时，收藏是交付环节；明确选择本次不收藏时才跳过。分组选择本身仍不授权收藏全部搜索结果。先根据岗位证据整理人选与具体缺口。用户已明确授权按已确认JD综合判断并收藏时，复用该任务范围，不再逐人索要批准；边界案例集中复核。记录收藏理由、未确认条件及用户反馈，收藏不等于全部条件已满足或最终录用。

执行前只读核对目标分组是否存在及人选当前收藏状态。分组不存在不擅自创建或改用未分组；已在目标组则记录已有状态，不重复写入。按稳定身份逐人添加，回读确认人选及分组；返回不明即暂停核对，不换ID重放。记录已确认收藏、已有收藏、未执行及异常，必要时说明尚未确认的目标组归属，不能仅凭全局收藏状态声称进了指定组。

浏览器步骤仅走Adapter；无接口的步骤交付明确人工提示，不自动使用Codex CUA或其他界面工具。


saved-search：list/save/apply/delete；favorite：status/add/remove；favorites：读取当前收藏列表。写操作必须有相应明确请求，删除方案/取消收藏需要目标精确匹配。task(tag)仅为本地标签。

发生 unknown/blocked：先保留 task(show) 状态和页面证据。resolve 是记录已核实结果，resume 是在核对后恢复任务，retry 是按原请求允许的有限重试；三者都不能把未知动作直接认定为未执行。不能删除历史、修改 JSON 或换 ID 绕过暂停。仍不清楚时交付已保存部分并指出具体待核对项。

浏览器参数 filters 使用 snake_case（如 expected_city）；本地轮次与授权核心 payload 使用 conditions 返回的 key（如 expectedCity）。conditions 同时返回 key/adapterKey，不混用。批次一次运行有截止时间，达到截止先核对任务状态，再继续同一批次；已完成项跳过，不创建新 ID。

### 方案与收藏返回值

`saved-search` 与 `favorites` 返回 `{snapshot: ...}`，业务回执位于 snapshot（方案名、total、rows 等），以保留官方 Site Adapter 行归一化会丢弃的字段。`tabs` 返回标签数组。显示条目数使用 rows.length，总量使用 total，二者不混同；总量为0和未读取分开处理。

## 已完成搜索的显式恢复

用户原结果页丢失或已离开时，先判断是否能复用已保存结果。旧卡片仅保存CSS目标时，不在新页面按旧序号点击；姓名不能作为跨集合身份。

只有明确准备恢复原条件且当前搜索页无结果、无输入草稿、无已选条件时，才使用恢复。恢复会提交真实查询，不是只读补读，也不保证返回原先相同的人选。

1. 用正式tabs/bind核对并绑定当前已有搜索页。若本任务原独立工作页已经关闭，可使用 `connect(new_workspace:true,replaces_operation_id:原创建操作ID)`；须精确授权含 `replacesOperationId` 的请求。宿主通过Chrome标签元数据独立确认原页不存在后才新建固定搜索页；仅库存列表未发现、其他会话占用、连接异常均不足以确认关闭。此步骤不提交搜索。白屏或未知操作不能走此入口换页重试。
2. 本地task(mode=`restoration-request`)传入 `{roundId:原轮次ID,page:当前数字tab_id,operationId:本次恢复ID}`，取得恢复请求。该命令仅生成请求，不授予执行权限；须按用户既有明确范围登记允许请求与预算。
3. 调用官方 `sites.run('liepin','search',{file,round_id,tab_id,restore:true,operation_id,reason})`。`reason`为实际页面丢失原因，不能省略。
4. 只有已完成且条件未变、已核对的原搜索可恢复。当前有结果、草稿、验证/风险提示、未知操作或中断记录时停止；不清空这些内容来迎合恢复条件。
5. 恢复保存为独立collection，原观察和原操作不覆盖。当前页的详情绑定指向新collection；新旧人选只按稳定ID及已核对证据关联，不按姓名/位置合并。不能将恢复结果记成原8条已核实。
6. 同一恢复ID已完成时只返回持久回执，不再派发；未知效果先核对，不换ID重试。

### 手机阅读与独立资料文件

评估HTML通过正式report导出，返回files.summary/details/records。主报告先显示统计快照，再展示跟进与少量边界案例；不将全部原文或JSON嵌在主报告。桌面使用表格，手机布局不应有页面级横向溢出。已保存详情链接指向同目录文件的稳定锚点，平台原简历仅链接已观察且身份一致的HTTPS猎聘地址，不猜URL、不主动打开平台验证链接。原始JSON包含完整任务与观察，保留私有权限；3个文件一起交付和移动。导出拒绝已有文件或符号链接，失败不覆盖原任务。

## 同一结果集逐页寻访

一次 prepare、一次 search（pages:1），处理当前页列表及必要详情，再调用官方 Adapter `next-page({file,tab_id,operation_id})`。先按已批准页数登记精确 `{kind:"page",payload:{tab_id}}` 请求；翻页后核对回执中的当前页和新观察，再继续处理，不重复提交同一查询来获取第N页。不能将上一页的卡片选择器带到新页。

继续当前页时用本地 task 的 detail-targets（底层 detailTargets）取得稳定 observation_id 与 hash，不直接从 candidate.observations 猜取 id；已关联观察的稳定ID可能是计算生成的。带“阅”只表示已读，去重依据是稳定身份和已确认收藏记录。

## 开发诊断与正式寻访分开

仓库 source-click.mjs 是只读开发验收脚本，不是正式寻访入口。必须显式给出关键词和实际授权原文；target表示最多读取的详情数，不能按新增收藏数计数。它不形成JD适配判断、不自动收藏，也不预置任何客户或分组。异常时保留现场、先核对，不为补足数量重搜或换ID重放。

正式收藏继续按本Skill的标准确认→逐项证据评估→跟进决定→精确授权→favorite-list→目标组回读执行。卡片关键词命中不能替代岗位评估。当前读取与收藏为两次调用时会重复打开详情，应如实记录该成本；不能为了少一次打开跳过详情核实。
