import type { Metadata } from 'next';
import { GllueLanding } from './landing';

export const metadata: Metadata = {
  title: 'Gllue 谷露人才库｜猎策 · 独立安装与使用',
  description: '谷露库内查询、LinkedIn 候选人查重、审核报告与授权维护。提供 Windows PowerShell 和 macOS 安装引导。',
};

export default function Page() { return <GllueLanding />; }
