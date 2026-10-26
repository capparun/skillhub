# LinkedIn 2.1.0

## 交付范围

在现有 soho-sourcing 产品中整合普通 LinkedIn、Sales Navigator 和模型驱动的任务记录、评估与报告入口。保留 Align、Sourcing、Outreach、Update 及旧寻访脚本。Sales Navigator 仍需实际账号权限；普通账号不需要 Sales Navigator。消息与邀请仍需用户明确授权。

运行组合：Node.js 22+；包内官方 OpenCLI 2.0.1；hunter-linkedin 2.0.9（项目兼容适配）；@hunter/core 2.0.8；LinkedIn 工作流组件 2.1.0。浏览器使用官方 OpenCLI 扩展，不分发修改版扩展。Windows 已连接的官方扩展为 1.0.24。

## 来源与维护

`distribution/linkedin-only` 是此次可重建发布的冻结源码；`LINKEDIN_2.1.0_SOURCE.json` 记录组成来源文件的哈希。业务源码继续由 CSK/Hunter 与 cskh-linkedin-salesnav 维护；以后更新必须重新审核合入分发快照，不能直接从脏目录发布。此次适配包含固定版本启动器、Skill 路径绑定、Node 22 检查与锁文件安装。`scripts/build-linkedin-release.py` 从冻结源码确定性构建 USTAR 归档，不包含本机环境、账号回执或依赖缓存。

## 已验证

- 新工作流本地回归 281 项通过。
- 分发站单元测试 43 通过，4 个数据库相关测试跳过；生产构建与类型检查通过。
- Windows 10 19045、PowerShell 5.1、Node 24.15.0：中文空格路径新装、持久运行时诊断、7 个 Skill 与 51 个 hunter-linkedin 命令加载通过。
- 未修改的正式 2.0.16 安装器在隔离 Windows 用户目录执行成功、旧版 doctor 通过，再由 2.1.0 安装器执行升级。新版 doctor 与已安装 Skill 启动器通过。使用独立 HOME/USERPROFILE 避免改变原用户插件注册。
- 官方 OpenCLI 扩展与 2.0.1 桥接连接成功。没有更换扩展，没有执行消息或邀请。

## 尚不属于本次通过结论

Windows 真实 LinkedIn 搜索及账号订阅检查未执行；其他 Agent 与系统未由 Windows Codex 安装结果外推。平台变化可能影响搜索，诊断成功不等于所有业务可用。线上安装闭环的实测结果在发布后追加。

## 发布与回滚

发布只允许在当前 soho-sourcing 版本仍为 2.0.16 且哈希匹配时切换；SQL 事务记录审计并保留旧归档。2.0.16 哈希为 457f6704d3856c00e430cef4b2cb11feca5f1c174c9b2a8357571bc788bf6804。

失败时停止发布或把该产品发布标记恢复到旧记录；不回滚其他产品，不删除原包。网站部署与产品发布分别验证。
