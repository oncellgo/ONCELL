import { Html, Head, Main, NextScript } from 'next/document';

/**
 * PWA 지원을 위한 HTML 문서 스킴.
 * - manifest.json 링크 (앱 메타데이터)
 * - theme-color (브라우저 address bar 색상)
 * - Apple touch icon 및 iOS 홈 화면 설치 지원 메타
 */
const Document = () => (
  <Html lang="ko">
    <Head>
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#20CD8D" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content="KCIS" />
      <link rel="apple-touch-icon" href="/icons/icon-512.png" />
      <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
      <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
    </Head>
    <body>
      <Main />
      <NextScript />
    </body>
  </Html>
);

export default Document;
