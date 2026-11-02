# 猎聘首次浏览器接入引导修复

状态：本地修改及预览验证完成，未上线；不改线上0.3.4归档。

问题：包准备扩展资产但安装nextSteps跳过Chrome加载及Native Messaging；网页缺少直接ZIP下载，连接指令在宿主未连通时过早要求进入猎聘。

本次：第2步常驻展示四步Chrome操作、独立ZIP下载与校验清单；复制指令包含版本匹配下载源、ZIP哈希、实际扩展目录、实际ID核对、通信plan/apply和MCP doctor。第3步才打开猎聘。产品安装回执新增browserSetup及extensionDownload；扩展ZIP由原固定兼容构建的12个公开文件生成，非另一份扩展身份或额外权限。

独立静态ZIP：public/download/liepin/hl-mcp-0.3.4.zip，641293字节，SHA256 b340bb3c661870ac66917e848857b2090b7c20bb4dfddbd5c9d212d8d0f851c6。附同名JSON，锁定兼容产品0.3.4/0.3.5及固定扩展ID。未知产品版本不展示匹配下载入口，优先回执持久目录。独立ZIP不包含宿主。

验证：网站专项与既有安装提示9/9；TypeScript通过；Next Webpack生产构建通过。浏览器实点“复制扩展接入指令”显示已复制；实点下载得到ZIP，回读哈希一致，Python独立验证CRC及12文件哈希与原安装资产一致。390px手机实际截图可读，document scrollWidth与innerWidth均390，无横向溢出。

本地预览：http://127.0.0.1:8896/skills/liepin-search#browser-setup。桌面及移动观察均未安装扩展或访问猎聘；下载行为不代表Chrome已加载。

发布范围需明确：网页修改需要部署分发站，产品回执改动需要构建并发布新的猎聘版本（拟0.3.5），不能覆盖0.3.4包。暂不修改其他产品的既有工作区改动或全局配置。

安装器验证：4项边界、415项核心通过，最终MCP318/318通过。独立ZIP导出在真实已校验运行时上通过，与静态下载ZIP哈希一致。冷缓存0.3.5平台安装遇ECONNRESET（保留失败报告，不标记通过）；随后从既有私有隔离0.3.4安装用候选官方upgrade成功到0.3.5，实际回执包含browserSetup和extensionDownload，check通过，未加载Chrome扩展。Windows本轮新增流程未做真机验收。
