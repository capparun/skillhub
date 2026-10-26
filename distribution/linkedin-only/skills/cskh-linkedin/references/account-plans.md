# 账号类别与套餐

资料基线核对日期：2026-10-25。知识说明不等于当前账号回执；不是自动检测功能已实现的声明。


沿用产品中的四类：普通账号、Premium、SalesNav、RPS。它们是导航分类，不强制互斥；一个身份可能具有多项产品权益。保存具体套餐及适用产品，不用单一等级覆盖所有权限。

| 类别 | 业务用途与权益理解 | 需要进一步确认 | 本项目边界 |
|---|---|---|---|
| 普通账号 | 普通 LinkedIn 搜索、可见资料与连接沟通；不能推断无限商业搜索 | 当前搜索是否受限、目标资料是否可见、消息入口是否可用 | 已有部分普通功能；搜索修复和新增整合尚未完整验收 |
| Premium | Career、Business、All-in-One 等并非同一套餐；面向求职或业务拓展的增强权益不同 | 具体套餐、InMail 当前余额、实际可用功能 | 不因 Premium 标签开放 SN 操作，也不自动宣称所有高级功能已支持 |
| SalesNav | 面向客户开发的公司与人员搜索、线索研究等；需记录 Core / Advanced / Advanced Plus 等实际套餐 | SN 页面访问、目标操作、席位及具体团队功能 | 已有 SN 实现和部分真实验收，不代表所有套餐功能均已适配 |
| RPS | Recruiter Professional Services，面向招聘服务机构；不能与 Recruiter Lite、Recruiter、RPS+ 混称 | 具体产品、席位合同、实际权限 | **尚未开发**；旧 recruiter-scout 命令存在不证明 RPS 已支持 |

官方说明 SalesNav 包含 Premium Business 功能；这是权益包含关系，不代表两者是同一产品，更不证明各入口余额可合并。[官方产品对比](https://business.linkedin.com/sell/sales-navigator/premium-versus-sales-navigator)

