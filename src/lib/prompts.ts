// 安装 Prompt / 命令模板。纯文本拼装,服务端与前端共用(不得引入 node 模块)。
// 令牌、下载地址等由调用方填好;模板改动不需要重新发布安装包。

export interface FreePromptInput {
  appUrl: string;
  productName: string;
  productSlug: string;
  version: string;
  sha256: string;
}

export interface PaidPromptInput {
  appUrl: string;
  productName: string;
  productSlug: string;
  token: string;
  tokenTtlMinutes: number;
}

export function freeInstallPrompt(input: FreePromptInput): string {
  const { appUrl, productName, productSlug, version, sha256 } = input;
  return `请帮我安装「${productName}」技能(猎策官方)。

步骤:
1. 检查环境:终端里 node --version 需要 ${['liepin-search', 'gllue-only'].includes(productSlug) ? '22' : '20'} 或更高。
2. 向我说明将要发生的变更(下载安装包、把技能安装到本机 AI 助手的 skills 目录),取得我确认后继续。
3. 下载安装包:
   curl -fsSL -o ${productSlug}.tar.gz "${appUrl}/api/products/${productSlug}/download"
4. 校验完整性:shasum -a 256 ${productSlug}.tar.gz 的输出必须是
   ${sha256}
   不一致就删除文件并告诉我,不要继续。
5. 解压后进入目录执行:
   node install.mjs --product ${productSlug} --version ${version} --server ${appUrl}
   然后执行 node doctor.mjs 检查环境。
6. 全部通过后用一句话告诉我可以开始使用了。

如果任何一步失败,把报错原样告诉我。`;
}

export function freeCliCommand(input: Pick<FreePromptInput, 'appUrl' | 'productSlug'>): string {
  return `curl -fsSL ${input.appUrl}/install.sh | bash -s -- ${input.productSlug}`;
}

export function windowsCliCommand(input: Pick<FreePromptInput, 'appUrl' | 'productSlug'>): string {
  return `$script = irm ${input.appUrl}/install.ps1; & ([scriptblock]::Create($script.TrimStart([char]0xFEFF))) -Product '${input.productSlug}'`;
}

export function windowsFreeInstallPrompt(input: FreePromptInput): string {
  return `请帮我在 Windows 上安装「${input.productName}」技能（猎策官方）。

要求：
1. 先运行 node --version，需要 Node.js ${['liepin-search', 'gllue-only'].includes(input.productSlug) ? '22' : '20'} 或更高版本；把真实版本输出告诉我。
2. 运行下面这一条 PowerShell 命令。不要自行改写安装步骤或手工复制文件：
   ${windowsCliCommand(input)}
3. 官方脚本会自动获取 v${input.version}、校验 SHA-256、安装插件和 Skills，并运行 doctor。
4. 把安装脚本和 doctor 的真实输出发给我；只有全部显示通过才算完成。
5. 如果 Agent 沙箱禁止写入用户目录，不要反复尝试或跳过检查。把同一条 PowerShell 命令交给我，让我在普通 PowerShell 中执行一次。

预期安装包 SHA-256（仅用于 .tar.gz，不用于 install.ps1）：${input.sha256}
${windowsInstallAcceptance}
如果任何一步失败，把完整报错原样告诉我。`;
}

export function windowsPaidCliCommand(input: Pick<PaidPromptInput, 'appUrl' | 'productSlug' | 'token'>): string {
  return `$script = irm ${input.appUrl}/install.ps1; & ([scriptblock]::Create($script.TrimStart([char]0xFEFF))) -Product '${input.productSlug}' -Token '${input.token}'`;
}

export function windowsPaidInstallPrompt(input: PaidPromptInput): string {
  return `请帮我在 Windows 上安装「${input.productName}」（猎策专业版）。

要求：
1. 先运行 node --version，需要 Node.js ${['liepin-search', 'gllue-only'].includes(input.productSlug) ? '22' : '20'} 或更高版本；把真实版本输出告诉我。
2. 向我说明即将兑换一次性令牌、下载并校验安装包、安装技能与 OpenCLI 插件；取得我确认后继续。
3. 确认后只运行下面这一条 PowerShell 命令。不要调用 bash、WSL 或 Git Bash，也不要自行改写安装步骤：
   ${windowsPaidCliCommand(input)}
4. 官方脚本会兑换令牌、校验 SHA-256、安装插件和 Skills，并运行 doctor。
5. 把安装脚本和 doctor 的真实输出发给我；只有全部显示通过才算完成。
6. 如果 Agent 沙箱禁止写入用户目录，不要反复尝试或跳过检查。把同一条 PowerShell 命令交给我，让我在普通 PowerShell 中执行一次。

安装令牌 ${input.tokenTtlMinutes} 分钟内有效且只能兑换一次。如果失败，把完整报错原样告诉我，不要重复兑换。`;
}

export function paidInstallPrompt(input: PaidPromptInput): string {
  const { appUrl, productName, productSlug, token, tokenTtlMinutes } = input;
  return `请帮我安装「${productName}」(猎策专业版)。

安装令牌(${tokenTtlMinutes} 分钟内有效,只能兑换一次):
${token}

步骤:
1. 检查环境:终端里 node --version 需要 20 或更高;确认本机装有 Chrome 浏览器。
2. 向我说明将要发生的变更(兑换令牌、下载安装包、安装技能与 opencli 插件),取得我确认后继续。
3. 兑换令牌,获取下载地址和更新凭据:
   curl -fsSL -X POST "${appUrl}/api/install-tokens/${token}/redeem"
   记下返回的 downloadUrl、release.version、release.sha256 和 updateCredential(只显示这一次)。
4. 下载安装包并用 shasum -a 256 校验,必须与 release.sha256 一致,不一致则中止。
5. 解压后进入目录执行(把尖括号换成上一步的实际值):
   node install.mjs --product ${productSlug} --version <version> --server ${appUrl} --update-credential <updateCredential>
   然后执行 node doctor.mjs 检查环境。
6. 全部通过后用一句话告诉我可以开始使用了。

注意:令牌兑换后立即作废,失败不要重复兑换;把报错原样告诉我。`;
}

export function paidCliCommand(input: Pick<PaidPromptInput, 'appUrl' | 'productSlug' | 'token'>): string {
  return `curl -fsSL ${input.appUrl}/install.sh | bash -s -- ${input.productSlug} ${input.token}`;
}

export interface StaticCliRelease {
  version: string;
  file: string;
  sha256: string;
}

// 静态托管的 npm 安装包兜底提示词：当数据库里还没有发布记录时，
// 直接引导安装 public/download/ 下的官方 tgz。npm 命令三平台一致，
// 无需区分 mac / Windows。
export function staticCliInstallPrompt(input: { appUrl: string; release: StaticCliRelease }): string {
  const { appUrl, release } = input;
  return `请帮我在本机安装猎策 LinkedIn 寻访能力（猎策官方安装包）。

步骤：
1. 确认 Node.js 20 或更高：node --version，把真实版本告诉我。
2. 运行这一条命令安装：
   npm install -g ${appUrl}/download/${release.file}
3. 安装完成后运行 opencli hunter-linkedin --help 验证：
   必须能看到 scout、normalize、evaluate、report、company、company-id-lookup、recruiter-scout、setup 这 8 个命令；
   不应再出现 xray、profile-view、list、tag、stats、export 这些旧命令。
4. 运行 opencli doctor 确认浏览器连接正常。
5. 把每一步的真实输出原样发给我，全部通过才算完成。

安装包版本 v${release.version}，SHA-256：${release.sha256}
如果任何一步失败，把完整报错原样告诉我。`;
}

export function staticCliCommand(input: { appUrl: string; file: string }): string {
  return `npm install -g ${input.appUrl}/download/${input.file}`;
}

// Keep environment failures distinct from installation and business acceptance.
export const windowsInstallAcceptance = `Windows 排错与验收：
- 页面 SHA-256 对应下载的 .tar.gz 安装包，不对应 install.ps1。不要拿安装包哈希校验引导脚本。
- 遇到 ENOTCACHED，先核对同一安装环境的 npm config get registry、npm config get cache、npm config get offline，以及缓存来源。registry 不一致、缓存缺包或离线模式都可能导致未命中；不能仅凭错误码排除网络问题。不自动修改全局 registry，不清空缓存，不擅自改用手工离线安装。
- doctor 出现 EBUSY、EPERM 或其他进程启动错误，表示检查无法执行，不能判定未安装，也不能判定通过。若安装步骤已成功，请在普通 PowerShell 仅执行日志目录 doctor-command.txt 中的检查命令；旧版日志没有该文件时，在已解压的安装包目录运行 node doctor.mjs。不要重跑安装或重复兑换令牌。若临时目录已清理，先定位已安装产品的 doctor，不要猜测路径。
- 看不到输出时，读取官方脚本显示的 hunter-install-log-* 目录中的 status.txt、install.txt、doctor.txt、error.txt 和 transcript.txt；若脚本尚未启动，可在普通 PowerShell 用 Start-Transcript -Path (Join-Path $env:TEMP 'hunter-bootstrap.log') 开始记录，执行官方命令后 Stop-Transcript。重定向必须指定文件，例如 *> ./hunter-output.log。
- 单独执行 opencli --version、opencli plugin list、opencli liepin conditions -f json 只能证明相应组件可运行；手工安装成功不等于官方通道通过。分别报告“官方安装流程”“组件可用性”“浏览器连接”“真实搜索”四项证据，未验证项明确保留。分享日志前脱敏。`;
