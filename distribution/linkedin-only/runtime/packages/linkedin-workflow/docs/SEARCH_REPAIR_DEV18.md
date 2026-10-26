# 关键词人员搜索修复：dev.18

2026-10-25。完成范围：`opencli hunter-linkedin salesnav-lead-search` 的纯关键词人员搜索，以及对应 API 游标续读。高级筛选和公司搜索仍为 DOM 路径，本轮未宣称修复。

## 故障证据

完整预检期间捕获：账号匹配、个人资料URL绑定成功，但自有标签 active=true 时 document.visibilityState 仍为 hidden，筛选面板长期为0。另一轮记录到同一流程中 hidden→visible 后控件从0恢复至40，搜索成功。因此不能将 page_not_ready 解释为无SalesNav权益，也不能将 active=true 解释为页面已可见。

OpenCLI v2.0.1 官方 extension/src/background.ts 的已有标签 resolveTab 直接复用；tabs/select 将标签设为active，未在该路径再次执行 focusOwnedWindowIfRequested。默认foreground不保证每个已有会话调用都重新激活窗口。这是已发现的工具行为；本机窗口被遮挡的最初来源仍未独立确定。单纯激活Chrome应用的诊断没有改善，不采用该方案或修改全局扩展。

来源：https://github.com/jackwener/opencli/blob/v2.0.1/extension/src/background.ts

## 修复

在 src/lead-api.mjs 隔离关键词搜索读取器，采用安装版本中上游linkedin/salesnav-search已使用的只读接口及LeadSearchResult-14装饰版本。凭证仅在已绑定账号的页面内使用，不在进程回执或本地文件中导出。每页请求前后校验实际目标、身份及阻挡提示；未观察到控件时不凭空宣称权限，而由实际200响应确认此请求可读取。403、登录、限流及结构异常明确失败。

高级筛选始终由原DOM路径执行，不能忽略筛选后替换为关键词。账号身份、精确个人URL、SalesNav工作区状态仍为必要条件。

每次最多25条，遵守limit与max_pages；保存绑定账号、查询、已确认结果和页内位置的本地校验游标，续读时防止重复、漏读和页内重排。API不是LinkedIn公开稳定开发者契约，后续兼容更新限于此模块。原始诊断资料仅留在.local。

## 最终真实验收（均无execution_context）

|命令场景|结果|秒|后置条件|
|---|---|---:|---|
|人员搜索 limit=1|max_pages=1，返回1人|34.59|接口前后hidden且控件0，正确返回，游标有效，会话关闭|
|人员搜索 limit=10|max_pages=1，返回10人|47.74|预检UI曾page_not_ready，实际接口验证成功，会话关闭|
|人员搜索 limit=25|max_pages=1，返回25人|24.68|返回游标，会话关闭|
|search-page limit=26|从25人增加1人，累计26个唯一ID|28.29|跨至第二页，未漏掉第26条，会话关闭|

四次CLI耗时合计135.30秒。251项本地测试通过，涵盖隐藏页面、身份变化、403/限流、异常结构、空结果、页数边界、部分页续读、跨页续读及高级筛选不被忽略。合成与真实证据分别保存。

边界：没有验证所有高级筛选、公司搜索、所有账号、长期稳定性或正式交付包；耗时仍主要受完整预检影响，不能称为性能优化已完成。本机插件软链接直接使用源码，未升级OpenCLI，未修改默认Profile，未发送或邀请，未正式发布或推送。

本地证据：.local/navigation-isolation/dev18-1.json、dev18-10.json、dev18-25.json、dev18-resume.json、dev18-tests.log。诊断前的失败证据继续保留，不覆盖成成功。


## dev.19 后续筛选验收（2026-10-25）

人员`SPD Scientific + geography=Singapore`返回3人，请求与实际筛选一致，32.97秒，会话关闭。公司`dental + company_headcount=51-200`在代理通过原生Chrome窗口菜单选择本次自有窗口后返回3家公司，请求与实际条件一致，39.47秒，会话关闭。公司前面的三次失败（45.65、44.90、36.11秒）保留，不能被末次成功覆盖。本轮5次真实业务CLI总耗时199.10秒，不含开发诊断。

新增`readPageVisibility`只读诊断：相同URL、已匹配身份、控件未就绪且页面hidden时明确为`window_not_visible`。这不是无权限证据。身份、本人URL和工作区已确认且仅预检临时未就绪时，在实际目标页重新验控件；明确拒绝仍阻止执行，实际控件未就绪不能选择筛选或返回结果。纯关键词API路径继续用实际响应验证其读取权限。

256项本地测试通过。高级筛选与公司UI路径需要可见自动化窗口，代理可用宿主原生窗口工具恢复；本轮没有完成纯CLI后台自动激活窗口。没有将所有高级筛选组合、医疗公司业务达标或目标人数宣称完成。

本地证据：.local/filtered-acceptance/。所有业务失败、成功、诊断及未采用的辅助空白会话试验分别保留，未关闭用户标签或更改全局配置。新测试结果追加到原报告.local/navigation-isolation/report.html，避免重复创建用户报告标签。
