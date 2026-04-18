import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import '../styles/globals.css';
import BottomNav from '../components/BottomNav';
import { AudioProvider } from '../components/AudioPlayer';
import { VideoProvider } from '../components/VideoPlayer';
import { themeCssVars } from '../styles/theme';
import '../lib/i18n';
import { detectAndApplyClientLang } from '../lib/i18n';

const App = ({ Component, pageProps }: AppProps) => {
  useEffect(() => { detectAndApplyClientLang(); }, []);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCssVars }} />
      <AudioProvider>
        <VideoProvider>
          <Component {...pageProps} />
          <BottomNav />
        </VideoProvider>
      </AudioProvider>
    </>
  );
};

export default App;
