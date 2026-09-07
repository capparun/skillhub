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
  return `请帮我安装「${productName}」技能(猎策免费版)。

步骤:
1. 检查环境:终端里 node --version 需要 20 或更高。
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
