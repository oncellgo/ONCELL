import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import '../styles/globals.css';
import { AudioProvider } from '../components/AudioPlayer';
import { VideoProvider } from '../components/VideoPlayer';
import { themeCssVars } from '../styles/theme';
import '../lib/i18n';
import { detectAndApplyClientLang } from '../lib/i18n';

const App = ({ Component, pageProps }: AppProps) => {
  useEffect(() => {
    detectAndApplyClientLang();
    // PWA 서비스 워커 등록 — prod/dev 모두. 실패해도 앱 동작엔 영향 없음.
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('[sw] register failed', err);
        });
      });
    }
  }, []);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCssVars }} />
      <AudioProvider>
        <VideoProvider>
          <Component {...pageProps} />
        </VideoProvider>
      </AudioProvider>
    </>
  );
};

export default App;
