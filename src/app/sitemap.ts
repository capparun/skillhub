import type { MetadataRoute } from "next";

// 引流页需要被搜索引擎发现;sitemap 随 PUBLIC_APP_URL 指向线上域名。
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.PUBLIC_APP_URL ?? "https://hunterskill.zeabur.app";
  return [
    { url: `${base}/skills/gllue`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/skills/maimai`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/skills/linkedin`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/skills/hunter-align`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/skills/liepin-search`, changeFrequency: "weekly", priority: 0.8 },
  ];
}
