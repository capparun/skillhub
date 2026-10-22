# 猎聘 MCP 命令说明

2026-10-22。根据当前 adapters/liepin 源码核对。共有15个浏览器业务命令，使用官方opencli-mcp的Site Adapter框架；猎聘命令由本项目实现，并非官方内置猎聘功能。兼容扩展负责连接，不负责招聘判断。本文不执行任何浏览器动作。

## 如何调用

Agent通过官方sites接口发现liepin的schema，再调用命令。下例是接口调用示意，不是终端Shell命令；不同助手显示的工具名称可能不同，以运行时发现结果为准。

```js
sites.run('liepin', 'tabs', {})
sites.run('liepin', 'results', {
  file: '/absolute/path/task.json',
  operation_id: 'read-list-01',
  tab_id: '实际绑定的标签ID',
  limit: 10
})
```

file为已有本机任务JSON绝对路径；operation_id为已登记授权的稳定操作ID，不能靠更换ID重试未知操作；tab_id必须来自实际发现和绑定，不是列表序号。下表参数为必填项，可选项另列。命令能调用不等于业务已成功，须核对返回的保存、完整性和确认状态。

## 浏览器命令总表

| 命令 | 做什么 | 必填参数 | 常用可选参数 |
| --- | --- | --- | --- |
| tabs | 列出现有猎聘标签ID、URL和页面类型；不读正文 | 无 | 无 |
| bind | 绑定已有页面，核对完整URL；保留用户标签 | file、tab_id、expected_url | 无 |
| connect | 打开或复用Adapter搜索工作页；不提交搜索 | file、operation_id | new_workspace=false、replaces_operation_id |
| prepare | 设置筛选并回读；不点搜索，但站点可能自动查询 | file、operation_id、tab_id、filters | verify_only只读；options_only查看选项后收起 |
| search | 按任务中已批准轮次提交搜索，逐页保存 | file、round_id、tab_id | restore=false；恢复时另需operation_id、reason |
| results | 保存当前页列表；不重新搜索、不翻页 | file、operation_id、tab_id | limit=3，范围1–30 |
| next-page | 在当前搜索结果上点击一次下一页，回读页码/首行并保存；不重新提交查询 | file、operation_id、tab_id | 无；须有对应翻页授权 |
| open-detail | 从已保存卡片点击姓名、展开并保存详情；默认关闭返回，可保留同页评估 | file、operation_id、tab_id、observation_id | keep_open=false；true时返回review.token |
| detail-review | 在本运行时保留的详情上按证据收藏，或关闭返回；不重开 | file、parent_tab_id、review_token、action | action=add/close；add另需operation_id、group |
| current-detail | 保存当前已绑定详情；不新建或关闭标签 | file、operation_id、tab_id、resume_id | expand=false，可展开已识别经历 |
| detail-batch | 执行已有持久详情队列，跳过完成项，未知项暂停 | file、id（批次ID）、tab_id | interval_ms=6000，范围1000–60000 |
| saved-search | 搜索方案管理 | file、operation_id、tab_id、action | action=list/save/apply/delete；name、current、filters、limit=3（1–30）；附加要求随action变化 |
| favorite | 核对当前简历收藏，或添加/取消并回读 | file、operation_id、tab_id、resume_id、action | action=status/add/remove；group（添加时指定准确组） |
| favorite-list | 从已核对列表定位人选，打开详情后收藏并返回列表 | file、operation_id、open_operation_id、tab_id、observation_id、group | action=add/remove；verify_only=false；create_group=false；group_operation_id |
| favorites | 读取收藏列表并保存，可切到准确分组核实 | file、operation_id、tab_id | group、limit=3（1–30）、workspace=false、after_operation_id |

默认limit=3是单次读取默认值，不是整个寻访只能看3人。search的关键词、筛选、页数与读取量来自任务轮次；不是直接给search传keyword或pages。批次必须先通过本地task创建，不能用任意候选人ID直接构造。

## 筛选参数

prepare.filters使用snake_case字段。下面只是示例，选项值应先读取实际页面，不代表已发起搜索：

```json
{
  "keyword": "伺服驱动",
  "experience": "5-10年",
  "education": "硕士",
  "expected_city": "北京"
}
```

30项字段：keyword关键词、match匹配方式、title职位名称、company公司名称、city目前城市、expected_city期望城市、experience工作年限、education学历、school_tier院校要求、full_time统招要求、industry当前行业、position当前职位、expected_industry期望行业、expected_position期望职位、activity活跃度、language语言、job_changes跳槽频率、school院校、major专业、job_status求职状态、resume_language简历语言、salary_min/salary_max目前年薪上下限、expected_salary_min/expected_salary_max期望年薪上下限、age_min/age_max年龄上下限、gender性别、overseas海外工作经验、management管理经验。

除overseas/management为布尔值外，Adapter筛选值为字符串；年薪单位万元/年。支持字段不等于默认用于筛选：个人敏感属性不用于评估、排序或默认筛选。

## 本地命令（不操作浏览器）

实际安装使用安装回执提供的localCommand。源码开发入口为：

```text
node tools/liepin-mcp/local.mjs conditions
node tools/liepin-mcp/local.mjs create INPUT.json
node tools/liepin-mcp/local.mjs task INPUT.json
node tools/liepin-mcp/local.mjs report INPUT.json
node tools/liepin-mcp/local.mjs doctor
```

| 命令 | 输入与输出 |
| --- | --- |
| conditions | 返回30项筛选字段、Adapter字段名和类型 |
| create | 输入file、title；创建任务，返回任务ID及路径 |
| task | 输入file、mode以及该mode所需input；管理需求、轮次、评估、授权、详情队列和续作状态。模式以源码taskModes为准，不是浏览器任意执行器 |
| report | 输入file、output、format；format=html/json/markdown/csv。HTML选view=evaluation生成重点摘要、详情文件和原始记录；view=platform为采集工作台 |
| doctor | 检查本地依赖；不证明Chrome连接或实际业务可用 |

评估报告的INPUT.json示例：

```json
{
  "file": "/absolute/path/task.json",
  "output": "/absolute/path/summary.html",
  "format": "html",
  "view": "evaluation"
}
```

## 标准业务流程

需求与标准确认、收藏分组确认 → 关键词探索 → tabs/bind（无工作页时connect）→ prepare及条件回读 → search → results及逐条复核 → open-detail/detail-batch按需核实 → 本地task记录证据与判断 → favorite/favorite-list → favorites独立确认分组 → report交付。

分页可由search按已批准轮次执行，也可在独立授权下用next-page前进一页；next-page只适用于搜索结果，不用于收藏列表。没有群发、联系、解锁或下载付费附件命令。saved-search的apply可能触发查询；favorite的remove和新建组需对应授权。resume_id和observation_id必须来自已观察数据，不猜ID或URL。白屏、验证或未知效果停止依赖动作，不重放未知写入。


## 同页评估后继续

需要读完再判断是否收藏时，open-detail传keep_open:true。保存返回后，Agent用本地证据完成标准对照和follow_up/clarify/not_pursued决定，再将review.token传给detail-review。add仍须准确人选、目标组和操作授权；页面已收藏时可返回saved:true、changed:false，不等于目标组已核实。完成后action:close关闭自己的详情并返回。不要重开同一详情，也不要以旧token跨宿主重启或刷新继续操作。

favorites的limit是当前可见数据返回上限，不保证一页显示该数量。total30而rows10时只核实了当前10条；目标未出现不证明不在组，不得自动重复收藏。完整组归属仍需独立的可见身份依据。
