import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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
  const [inApp, setInApp] = useState<InAppInfo | null>(null);
  const [copied, setCopied] = useState(false);
  // 개인정보 수집·이용 동의 모달
  const [pendingProvider, setPendingProvider] = useState<'kakao' | 'google' | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    setInApp(detectInAppBrowser(ua));
  }, []);

  const startLogin = (provider: 'kakao' | 'google') => {
    // 이미 동의한 재방문자는 모달 스킵 → 바로 OAuth
    try {
      if (window.localStorage.getItem('kcisPrivacyConsented') === '1') {
        window.location.href = `/api/auth/${provider}`;
        return;
      }
    } catch {}
    setConsentChecked(false);
    setPendingProvider(provider);
  };

  const confirmConsent = () => {
    if (!consentChecked || !pendingProvider) return;
    try {
      window.localStorage.setItem('kcisPrivacyConsented', '1');
      window.localStorage.setItem('kcisPrivacyConsentedAt', new Date().toISOString());
    } catch {}
    window.location.href = `/api/auth/${pendingProvider}`;
  };

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
        <title>KCIS | 로그인</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: 420, padding: '2rem 1.75rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1.1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem' }}>🕊️</div>
            <h1 style={{ margin: '0.4rem 0 0', fontSize: '1.3rem', color: '#3F6212' }}>KCIS 로그인</h1>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>싱가폴한인교회 · 로그인 방법을 선택하세요</p>
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
                ⚠️ {inApp.label} 브라우저에서는 Google 로그인이 차단됩니다
              </div>
              <div style={{ fontSize: '0.82rem', color: '#92400E', lineHeight: 1.55 }}>
                {inApp.platform === 'ios' ? (
                  <>
                    <strong>iPhone 해결 방법</strong><br />
                    우측 상단 <strong>⋯ 메뉴</strong> → <strong>&quot;Safari로 열기&quot;</strong> 또는 <strong>&quot;다른 브라우저로 열기&quot;</strong> 선택
                  </>
                ) : inApp.platform === 'android' ? (
                  <>
                    <strong>Android 해결 방법</strong><br />
                    아래 <strong>&quot;Chrome에서 열기&quot;</strong> 버튼을 누르거나, 우측 상단 <strong>⋯ 메뉴</strong> → <strong>&quot;다른 브라우저로 열기&quot;</strong> 선택
                  </>
                ) : (
                  <>우측 상단 메뉴에서 <strong>외부 브라우저로 열기</strong>를 선택해주세요.</>
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
                  Chrome에서 열기
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
                {copied ? '✓ 주소 복사됨' : '📋 로그인 주소 복사'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => startLogin('kakao')}
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
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              cursor: 'pointer',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3C6.48 3 2 6.58 2 11c0 2.78 1.77 5.23 4.5 6.65L5.5 21l3.85-2.12c.86.16 1.75.24 2.65.24 5.52 0 10-3.58 10-8S17.52 3 12 3z" fill="#181600"/>
            </svg>
            카카오 로그인
          </button>

          <button
            type="button"
            disabled={!!inApp}
            onClick={() => {
              if (inApp) {
                alert(`${inApp.label} 내장 브라우저에서는 Google 로그인이 차단됩니다.\n위 안내에 따라 외부 브라우저(Chrome/Safari)로 열어주세요.`);
                return;
              }
              startLogin('google');
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
            Google 로그인
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.4rem' }}>
            <Link href="/" style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', textDecoration: 'none' }}>← 홈으로</Link>
          </div>
        </div>

        {pendingProvider && (
          <div
            role="dialog"
            aria-label="개인정보 수집 및 이용 동의"
            onClick={(e) => { if (e.target === e.currentTarget) setPendingProvider(null); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          >
            <div style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #D9F09E' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #ECFCCB', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span aria-hidden style={{ fontSize: '1.3rem' }}>🔒</span>
                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#3F6212' }}>
                  개인정보 수집 및 이용 동의 <span style={{ color: '#DC2626' }}>[필수]</span>
                </h3>
              </div>

              <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'grid', gap: '0.75rem', fontSize: '0.85rem', color: '#4B5563', lineHeight: 1.6 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, color: '#365314' }}>1. 수집 항목 및 목적</p>
                  <p style={{ margin: '0.15rem 0 0' }}>
                    <strong style={{ color: '#365314' }}>수집 항목:</strong> 이름, 연락처(휴대전화 번호), 이메일·닉네임 (카카오/구글 소셜 로그인 제공)
                  </p>
                  <p style={{ margin: '0.15rem 0 0' }}>
                    <strong style={{ color: '#365314' }}>수집 목적:</strong> 교인 식별 및 본인 확인, 장소 예약 신청·관리 및 예약자 연락, 개인화 서비스(큐티·성경통독 기록) 제공
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, color: '#365314' }}>2. 보유 및 이용 기간</p>
                  <p style={{ margin: '0.15rem 0 0' }}>회원 탈퇴 시 즉시 파기</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, color: '#365314' }}>3. 동의 거부 권리 및 불이익 안내</p>
                  <p style={{ margin: '0.15rem 0 0' }}>
                    귀하는 정보 수집에 동의하지 않을 수 있습니다. 단, 이름과 연락처는 서비스 제공을 위한 <strong>필수 정보</strong>로, 입력을 거부하거나 허위 정보를 입력할 경우 회원가입 및 장소 예약 서비스 이용이 제한됩니다.
                  </p>
                  <p style={{ margin: '0.15rem 0 0', color: '#B91C1C' }}>
                    입력된 정보가 허위로 판명될 경우, 사전 고지 없이 예약이 임의로 취소될 수 있음을 알려드립니다.
                  </p>
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.65rem 0.8rem', borderRadius: 8, background: '#F7FEE7', border: '1px solid #D9F09E', cursor: 'pointer', marginTop: '0.25rem' }}>
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: '#65A30D', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#3F6212', lineHeight: 1.5 }}>
                    본 사이트 이용을 위해 개인정보 수집 및 이용에 동의하십니까? <span style={{ color: '#DC2626' }}>*</span>
                  </span>
                </label>
              </div>

              <div style={{ padding: '0.85rem 1.25rem 1rem', borderTop: '1px solid #ECFCCB', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setPendingProvider(null)}
                  style={{ padding: '0.7rem 1.1rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.92rem', minHeight: 44, cursor: 'pointer' }}
                >취소</button>
                <button
                  type="button"
                  onClick={confirmConsent}
                  disabled={!consentChecked}
                  style={{ padding: '0.7rem 1.1rem', borderRadius: 10, border: 'none', background: consentChecked ? 'var(--color-primary)' : '#9CA3AF', color: '#fff', fontWeight: 800, fontSize: '0.92rem', minHeight: 44, cursor: consentChecked ? 'pointer' : 'not-allowed' }}
                >동의하고 계속</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
};

export default LoginPage;
