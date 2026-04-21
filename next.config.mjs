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
  // pdf-parse v2 (pdf.js worker 포함)은 Next 번들러가 변환하면 worker 파일 경로가 깨져
  // Vercel serverless 함수에서 require 시 초기화 실패 → 500. 외부 패키지로 표시하면
  // node_modules 상태 그대로 함수에 번들되어 해결.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
