# 确定性平台操作规格

基础操作验证于冻结运行代码0.1.0-dev.8（81ac508ecbd9）；dev.9仅补独立nominal_quota unknown字段。参数示例见README，操作目录由无参数capabilities返回；本文描述执行层，不规定行业、地区、规模、角色判断或工作顺序。所有平台操作只读；export仅写用户指定的本地新文件。没有发送、保存、CRM或订阅修改接口。

## 公共契约与资源

- 平台操作绑定profile、expected_identity和预期自有资料URL；完整account-check可观察自有URL，依赖业务操作要求明确URL。名称不作为唯一身份。
- CLI严格拒绝未知输入字段；公共request_budget为1–500整数，默认120，单位是OpenCLI协议调用。它不表示官方余额或标称月额度。
- 可选execution_context为五分钟以内的本地不透明诊断ID；每次仍核对连接代次和当前自有URL，实际页面再次验证能力。过期/失效不自动更新旧上下文；重新account-check。账号检查本身不接受context。
- 同一Profile使用互斥锁；竞争任务profile_busy且不改前一任务的页面。每条命令只使用自身拥有的session，预留关闭预算，finally实际关闭自有页；不接管用户绑定页。关闭失败单独报告，不重跑业务动作。
- OpenCLI单次子进程超时20秒；页面检查通常最多8轮、轮间1秒。它们是固定就绪轮询，不是无界重复业务动作。分页另有最多300步及8次无进展上限，仍受总调用预算约束。
- 固定适配器使用当前DOM精确字段/label/role定位，唯一性、可见性及启用状态不足时停止。模型没有自定义选择器、页面脚本或任意导航参数。

## 操作及状态转移

| 操作 | 输入与入口 | 固定步骤及成功后置条件 | 输出和证据 |
| --- | --- | --- | --- |
| doctor | 明确Profile；本地Node/OpenCLI及连接清单 | 检查运行依赖与指定连接，不打开业务页；不据此认定订阅 | 环境、连接、access-not-checked；源码doctor.mjs |
| account-check | Profile、期望身份/可选已知自有URL；feed、SalesNav首页、两类搜索及套餐设置 | 先连接与站内身份，再独立检查首页/公司/人员页；精确自有URL绑定，设置空壳只保留未知套餐/余额；身份不符停止 | 分项available/unavailable/unknown、官方余额及来源、restricted_features；account-check.test、受控门禁及真实诊断 |
| capabilities | 无输入为本地目录；带绑定/search_type时进入对应筛选页 | 账号能力门禁，读取真实展开/收起字段；与适配器目录合并，未适配字段不得提升为支持 | visible、locked unknown、来源、实现/实测模式及受限项；capabilities.mjs、真实两类目录 |
| filter-options | 绑定、search_type、field；动态query | 门禁→打开对应面板→展开已定义字段→需要时输入query→读取响应；不猜ID，同名候选保留歧义 | 原始option_label、规范UI label、模式、occurrences、platform_id可为null、来源；fields/core-filter-options、真实字段矩阵 |
| account-search | 绑定、原样keywords、filters、limit/max_pages | 校验字段/模式→门禁→干净公司搜索页→按明确参数输入/展开/解析/点击→每步验证实际页面query及选中条件→读取卡片 | requested/applied、带ID/URL结果、范围/分页/截断；COMPANY_FIELD_VERIFICATION及受控后置差异 |
| lead-search | 同上；人员专有字段 | 同上，使用人员搜索页和人员字段；总部、人员地区、职位、职能、职级不互换 | 同类元数据、人员实体；LEAD_FIELD_VERIFICATION |
| account-read | 绑定、数字ID或严格规范公司URL | 门禁→目标公司页→读取定义头部和About→仅展开已定义About一次→复核身份与目标URL | name/industry/location/员工数原文/revenue/website/about，各字段observed或not_observed；全页并未读取 |
| lead-read | 绑定、规范人员token或URL | 门禁→目标人员页→读取profile card/current roles/About→仅展开已定义About→复核身份与目标URL | name/headline/location/about/current_roles；任职更多时partial，缺失不由headline补造 |
| search-page | 绑定、本地cursor、累计limit/max_pages | 开浏览器前校验版本/期限/完整性/查询指纹→重新账号门禁→恢复原查询→每帧核对身份、query、页码与slots→有界续页 | 累计returned_count、本次new_count、多页hits、partial/interruption及新cursor；不得把窗口末页当平台全集 |
| export | 已提供结果文件的input_path、format、output_path | 校验/读取→敏感字段检查→确定性序列化→排他临时文件→原子发布，不覆盖已有目标；失败清理临时件 | 路径/格式/计数；完整envelope保存，CSV安全展示+original_json；EXPORT_AND_SEARCH_REPLAY_VERIFICATION |

通用搜索的filters是完整替换：filters:{}清除字段，省略keywords清除关键词；字段空数组非法。关键词保留Unicode/引号/布尔表达式，由平台解释。默认首屏；显式limit为1–2500、max_pages为1–10。上限不是“合格公司数量”或业务判断。

## 失败、派发及恢复

错误外层为ok:false、error.code；执行元数据记录phase、last_outcome和used/remaining。attempting/unconfirmed不能解释为动作一定没发生；confirmed_return也不能替代页面后置条件。搜索条件不生效返回search_not_confirmed及requested/observed差异。读取/收集阶段中断可为ok:true的partial envelope，必须检查interruption和completeness；此时旧诊断缓存失效。

| 分类 | 代表错误 | 恢复规则 |
| --- | --- | --- |
| 参数/未适配 | invalid_input、unsupported、invalid_option | 纠正明确参数或开发适配；不静默删条件 |
| 身份/权限 | account_unconfirmed、identity_mismatch、login_required、verification_required、access_denied | 停止依赖操作，用户处理登录/验证后重新完整检查；不换Profile |
| 环境/页面 | bridge_failure、bridge_timeout、window_not_visible、page_changed、page_not_ready、page_blocked | 保留已读范围，报告阶段；未知弹层不自动点击，禁止临时浏览器兜底 |
| 限流/预算 | rate_limited、budget_exhausted | 停止；预算在下一次派发前判断，关闭预留不挪作业务；不自动扩大预算 |
| 恢复上下文 | context_expired、context_invalidated、invalid_execution_context、invalid_checkpoint、checkpoint_expired、checkpoint_version_mismatch、query_mismatch | 坏cursor不修补、不改查询后沿用；重新检查/重新查询，旧事实独立保存 |
| 文件 | export_read_failed、export_write_failed、export_exists、sensitive_data | 不报假成功；换合法的新路径或处理输入后重试，不覆盖已有文件 |

## 证据边界

实时字段矩阵验证真实OpenCLI与站点行为；仓库受控工具穿过生产CLI、协议桥及实际DOM，合成账号快照不冒充现场登录证据。错误布局不在真实站点故意制造。每个回执与源码/包版本关联，业务事实、模型判断和未知分离；实际完成状态以ACCEPTANCE及STATUS为准。
