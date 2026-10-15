import type { Metadata } from 'next';
import { LinkedInLanding } from './landing';

export const metadata: Metadata = {
  title: 'LinkedIn 人才寻访｜猎策 · 独立安装与使用',
  description: '在 LinkedIn 搜索候选人，完成匹配排序、候选人初评与寻访报告。提供 WorkBuddy 安装和连接检查步骤。',
};

export default function Page() {
  return <LinkedInLanding />;
}
