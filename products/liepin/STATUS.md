# 当前状态

核对日期：2026-10-21。本文件是当前产品状态入口；旧交接、旧版README及历史验收记录仅用于追溯，不据此选择当前执行通道。

| 对象 | 当前值 | 边界 |
| --- | --- | --- |
| 产品候选 | 0.3.0，指纹`d8bd7bdc35788ad246f0b99b86d945c8d824c9ec938876b4b453949f82bf752f` | 未批准、未发布；源码package.json仍保留开发默认0.3.0-alpha.1，正式候选由构建参数生成 |
| 固定产品来源 | `37f8583f`；CI-only配置修复`0e614b18` | 不等同于当前浏览器已安装版本 |
| 上游MCP | opencli-mcp 0.0.30 | 固定依赖，不是OpenCLI CLI 2.0 |
| 扩展来源 | 官方扩展0.0.22＋本项目兼容补丁 | 不声称官方原版能完成当前全部业务；无Chrome商店独立发布 |
| 当前真机宿主 | `2b7808b3`（完整指纹见验收卡） | 保留已完成真实业务的环境；未切换新候选 |
| 扩展固定ID | `ebhhcfiikojppnmkimkhcajpieelbglb` | 扩展版本、宿主指纹、产品版本分别记录 |
| 旧CLI版本 | 0.2.3历史来源 | 当前可用性未验证，不宣称已坏或仍可运行 |
| macOS云端Intel及本机ARM64 | 核心386/MCP200、安装22项通过 | CI成功不替代目标助手首次业务 |
| Windows云端 | 核心386/MCP195、安装22项通过 | Native Messaging注册表为注入契约，真实Chrome仍未验 |
| 真实业务 | 搜索、筛选、分页、详情、方案、收藏及报告分别有版本化证据 | 不是新候选所有功能同版重跑；详情partial不称完整 |
| 发布状态 | 未合并本次整理分支、未上线 | 不改Zeabur或现用浏览器环境 |

[同轮双平台CI](https://github.com/capparun/skillhub/actions/runs/39532561247)；[固定候选及平台回执索引](../../tools/liepin-mcp/evidence/2026-10-21-cross-platform-candidate.json)。Windows检出CRLF，与本机LF导致平台指纹不同，分开记录，不混用归档哈希。

## 尚未完成

- Windows真实Chrome、Native Messaging和首次业务：用户暂无Windows环境。
- 目标助手首次调用：Claude Code此前暂缓；WorkBuddy桌面未验。
- Zeabur维护入口只读核对：此前登录暂缓。

以上不以重复本地测试补齐。本轮结构整理不解除这些门，也不是上线申请。
