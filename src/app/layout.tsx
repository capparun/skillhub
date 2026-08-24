import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "猎策 Hunter Works｜SOHO 猎头的 Agent 工作流",
  description:
    "面向 SOHO 猎头的官方 Agent 工作流。把需求对齐、猎聘与 LinkedIn 人才寻访能力安装到你的本地 Agent。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
