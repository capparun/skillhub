import type { Metadata } from "next";
import { HunterAlignLanding } from "./landing";

export const metadata: Metadata = {
  title: "职位需求对齐 hunter-align｜免费猎头 AI 技能，免登录安装",
  description:
    "免费 Agent 技能：把真实 JD 交给 AI，自动诊断模糊与缺失的招聘要求、追问关键问题，产出人才画像与寻访任务书。免登录安装，职位数据不离开你的电脑。",
  openGraph: {
    title: "职位需求对齐 hunter-align｜猎策免费技能",
    description:
      "JD 诊断、关键问题追问、人才画像、寻访任务书。免费、免登录，装进你的 Agent。",
    type: "website",
  },
};

export default function Page() {
  return <HunterAlignLanding />;
}
