import type { Metadata } from 'next';
import { MaimaiLanding } from './landing';

export const metadata: Metadata = {
  title: '脉脉人才寻访｜猎策 · ego-lite 独立交付',
  description: '脉脉人才搜索、候选人信息整理和本地导出。当前使用 ego-lite，Mac 实测，提供 Codex 安装、连接与首次搜索指引。',
};

export default function Page() {
  return <MaimaiLanding />;
}
