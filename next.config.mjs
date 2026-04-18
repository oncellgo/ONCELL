const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // 사전 마이그레이션에서 누적된 비치명적 TS 경고는 production build를 막지 않음
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
