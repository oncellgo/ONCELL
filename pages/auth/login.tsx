import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type InAppInfo = {
  kind: 'kakao' | 'instagram' | 'facebook' | 'naver' | 'line' | 'kakaostory' | 'other';
  label: string;
  platform: 'android' | 'ios' | 'unknown';
};

/**
 * 메신저·SNS 앱의 내장 브라우저(WebView) 감지.
 * Google OAuth가 2021년부터 이런 인앱 웹뷰에서 로그인을 차단하므로,
 * 감지 시 외부 브라우저로 유도 필요.
 */
const detectInAppBrowser = (ua: string): InAppInfo | null => {
  const platform: InAppInfo['platform'] = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'unknown';
  if (/KAKAOTALK/i.test(ua)) return { kind: 'kakao', label: '카카오톡', platform };
  if (/KAKAOSTORY/i.test(ua)) return { kind: 'kakaostory', label: '카카오스토리', platform };
  if (/Instagram/i.test(ua)) return { kind: 'instagram', label: '인스타그램', platform };
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { kind: 'facebook', label: '페이스북', platform };
  if (/NAVER\(inapp/i.test(ua) || /; NAVER /i.test(ua)) return { kind: 'naver', label: '네이버앱', platform };
  if (/Line\//i.test(ua)) return { kind: 'line', label: '라인', platform };
  return null;
};

const LoginPage = () => {
  const { t } = useTranslation();
  const [inApp, setInApp] = useState<InAppInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    setInApp(detectInAppBrowser(ua));
  }, []);

  const currentUrl = typeof window !== 'undefined' ? window.location.href.replace(/\/auth\/login.*$/, '/auth/login') : '';

  const openInChromeAndroid = () => {
    const host = 'kcis-ecru.vercel.app';
    const intent = `intent://${host}/auth/login#Intent;scheme=https;package=com.android.chrome;end`;
    window.location.href = intent;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard API 실패 시 prompt로 폴백
      window.prompt('이 주소를 복사하세요:', currentUrl);
    }
  };

  return (
    <>
      <Head>
        <title>ONCELL | 로그인</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: 420, padding: '2rem 1.75rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1.1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem' }}>🕊️</div>
            <h1 style={{ margin: '0.4rem 0 0', fontSize: '1.3rem', color: '#3F6212' }}>{t('page.auth.loginTitle')}</h1>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>{t('page.auth.loginSub')}</p>
          </div>

          {inApp && (
            <div
              role="alert"
              style={{
                padding: '0.9rem 1rem',
                borderRadius: 12,
                background: '#FEF3C7',
                border: '1px solid #FBBF24',
                display: 'grid',
                gap: '0.6rem',
              }}
            >
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#78350F', lineHeight: 1.4 }}>
                {t('page.auth.inappWarn', { browser: inApp.label })}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#92400E', lineHeight: 1.55 }}>
                {inApp.platform === 'ios' ? (
                  <>
                    <strong>{t('page.auth.inappIos')}</strong><br />
                    {t('page.auth.inappIosDetail')}
                  </>
                ) : inApp.platform === 'android' ? (
                  <>
                    <strong>{t('page.auth.inappAndroid')}</strong><br />
                    {t('page.auth.inappAndroidDetail')}
                  </>
                ) : (
                  <>{t('page.auth.inappFallback')}</>
                )}
              </div>
              {inApp.platform === 'android' && (
                <button
                  type="button"
                  onClick={openInChromeAndroid}
                  style={{
                    padding: '0.7rem 1rem',
                    borderRadius: 10,
                    border: 'none',
                    background: '#D97706',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    minHeight: 42,
                  }}
                >
                  {t('page.auth.openChrome')}
                </button>
              )}
              <button
                type="button"
                onClick={copyLink}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: 10,
                  border: '1px solid #FBBF24',
                  background: '#fff',
                  color: '#92400E',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  minHeight: 40,
                }}
              >
                {copied ? t('page.auth.copied') : t('page.auth.copyUrl')}
              </button>
            </div>
          )}

          <a
            href="/api/auth/kakao"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.55rem',
              padding: '0.85rem 1rem',
              borderRadius: 12,
              background: '#FEE500',
              color: '#181600',
              fontWeight: 800,
              fontSize: '0.98rem',
              textDecoration: 'none',
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3C6.48 3 2 6.58 2 11c0 2.78 1.77 5.23 4.5 6.65L5.5 21l3.85-2.12c.86.16 1.75.24 2.65.24 5.52 0 10-3.58 10-8S17.52 3 12 3z" fill="#181600"/>
            </svg>
            {t('page.auth.loginKakao')}
          </a>

          <a
            href="/api/auth/google"
            onClick={(e) => {
              if (inApp) {
                e.preventDefault();
                alert(`${inApp.label} 내장 브라우저에서는 Google 로그인이 차단됩니다.\n위 안내에 따라 외부 브라우저(Chrome/Safari)로 열어주세요.`);
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.55rem',
              padding: '0.85rem 1rem',
              borderRadius: 12,
              background: inApp ? '#F3F4F6' : '#ffffff',
              color: inApp ? '#9CA3AF' : '#1F2937',
              fontWeight: 700,
              fontSize: '0.98rem',
              textDecoration: 'none',
              border: inApp ? '1px dashed #D1D5DB' : '1px solid #D1D5DB',
              boxShadow: inApp ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
              opacity: inApp ? 0.75 : 1,
              cursor: inApp ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" style={{ opacity: inApp ? 0.5 : 1 }}>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.8-2 13.3-5.2l-6.2-5.2c-2 1.4-4.5 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C41.3 35 44 29.9 44 24c0-1.2-.1-2.3-.4-3.5z"/>
            </svg>
            {t('page.auth.loginGoogle')}
          </a>

          <div style={{ textAlign: 'center', marginTop: '0.4rem' }}>
            <Link href="/" style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', textDecoration: 'none' }}>{t('page.auth.homeLink')}</Link>
          </div>
        </div>
      </main>
    </>
  );
};

export default LoginPage;
