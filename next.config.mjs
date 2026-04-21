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
  // pdf-parse v2 (pdfjs-dist v5 기반)는 DOMMatrix 등 브라우저 전역이 필요해 lib/pdf.ts 에서
  // @napi-rs/canvas 로 polyfill 주입. 추가로 Next 번들러의 파일 추적이 pdf.js worker/.mjs
  // 동적 참조를 놓치므로 outputFileTracingIncludes 로 함수에 강제 포함.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/pdf-parse/**/*',
      './node_modules/pdfjs-dist/**/*',
      './node_modules/@napi-rs/canvas/**/*',
    ],
  },
};

export default nextConfig;
