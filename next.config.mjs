/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  // 明确项目根，避免 Next.js 误判到上级目录
  outputFileTracingRoot: process.cwd(),
  // 静态导出模式下，所有数据在构建时从 data/ 读入并内联
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
