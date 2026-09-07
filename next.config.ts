import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  // 发布包/密钥等服务端资源不进 bundle
  serverExternalPackages: ["pg"],
};

export default nextConfig;
