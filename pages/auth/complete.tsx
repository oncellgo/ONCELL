import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type PendingProfile = { profileId: string; provider: string; nickname: string; email: string };

const CompleteSignupPage = () => {
  const { t } = useTranslation();
  const router = useRouter();

  // A 방안: OAuth 프로필은 callback 에서 sessionStorage 에 보관. 여기서 읽어서 동의 후에만 서버에 저장.
  const [pending, setPending] = useState<PendingProfile | null>(null);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem('kcisPendingProfile');
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.profileId) setPending({ profileId: p.profileId, provider: p.provider || '', nickname: p.nickname || '', email: p.email || '' });
      }
    } catch {}
  }, []);

  // provider 판별: sessionStorage 우선, 없으면 query fallback
  const queryProvider = typeof router.query.provider === 'string' ? router.query.provider : '';
  const provider = pending?.provider || queryProvider;
  const providerLabel = provider === 'kakao' ? '카카오' : provider === 'google' ? '구글' : '소셜';
  // 헤더 색상을 provider 브랜드 톤에 맞춰 조정.
  const headerTheme = provider === 'google'
    ? { bg: '#F8FAFF', badgeBg: 'rgba(26, 115, 232, 0.12)', badgeColor: '#1A73E8', titleColor: '#202124', subColor: '#5F6368', border: '1px solid #DADCE0' }
    : { bg: '#FEE500', badgeBg: 'rgba(24, 22, 0, 0.1)', badgeColor: '#181600', titleColor: '#181600', subColor: '#3D3A00', border: 'none' };

  const needPrivacy = true; // A 방안에선 이 화면 진입 자체가 동의 받기 위함. 항상 true.

  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!privacyChecked) { setError('개인정보 수집 및 이용에 동의해주세요.'); return; }
    if (!pending) { setError('로그인 정보를 찾을 수 없습니다. 다시 로그인해주세요.'); return; }

    setSubmitting(true);
    try {
      // 동의와 함께 서버에 approval 생성·업데이트 (privacyConsent 저장) — 여기가 유일한 "수집" 시점.
      const res = await fetch('/api/auth/record-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: pending.profileId,
          provider: pending.provider,
          nickname: pending.nickname,
          email: pending.email,
          privacyConsent: true,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d?.error === 'blocked') {
          try { window.sessionStorage.removeItem('kcisPendingProfile'); } catch {}
          router.replace('/auth/blocked');
          return;
        }
        setError(`저장 실패 (${res.status})${d?.error ? `: ${d.error}` : ''}`);
        setSubmitting(false);
        return;
      }

      const approvalStatus: 'pending' | 'approved' | 'rejected' | 'blocked' = d?.approval?.status || 'approved';

      // 동의·저장 성공 시점에만 브라우저 로그인 플래그 기록.
      try {
        if (pending.nickname) window.localStorage.setItem('kcisNickname', pending.nickname);
        if (pending.email) window.localStorage.setItem('kcisEmail', pending.email);
        window.localStorage.setItem('kcisProfileId', pending.profileId);
        // 가입 완료 직후 대시보드에서 1회 환영 배너 노출 플래그
        window.localStorage.setItem('kcisShowWelcome', '1');
        window.sessionStorage.removeItem('kcisPendingProfile');
      } catch {}

      if (approvalStatus === 'pending') { router.replace('/auth/pending'); return; }
      if (approvalStatus === 'rejected') { router.replace('/auth/rejected'); return; }
      router.replace(`/dashboard?profileId=${encodeURIComponent(pending.profileId)}&nickname=${encodeURIComponent(pending.nickname)}&email=${encodeURIComponent(pending.email)}`);
    } catch {
      setError('저장 실패. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head><title>KCIS | 가입 마무리</title></Head>
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: '#FAFAFA', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* provider 브랜드 톤 헤더 — 단계 배지 + 연결 확인 */}
          <div style={{ padding: '1.5rem 1.5rem 1.1rem', background: headerTheme.bg, borderBottom: headerTheme.border, textAlign: 'center', position: 'relative' }}>
            <span style={{ display: 'inline-block', padding: '0.2rem 0.7rem', borderRadius: 999, background: headerTheme.badgeBg, color: headerTheme.badgeColor, fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.02em', marginBottom: '0.5rem' }}>
              KCIS 가입 마무리 단계
            </span>
            <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: headerTheme.titleColor, lineHeight: 1.45, wordBreak: 'keep-all', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {provider === 'google' && (
                <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.8-2 13.3-5.2l-6.2-5.2c-2 1.4-4.5 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C41.3 35 44 29.9 44 24c0-1.2-.1-2.3-.4-3.5z"/>
                </svg>
              )}
              <span>✓ {providerLabel} 계정 연결이 확인되었습니다</span>
            </h1>
            <p style={{ margin: '0.4rem 0 0', color: headerTheme.subColor, fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.55, wordBreak: 'keep-all' }}>
              서비스 이용을 위해 아래 동의가 필요합니다.
            </p>
          </div>

          <div style={{ padding: '1.25rem 1.5rem 1.5rem', display: 'grid', gap: '1rem' }}>

          {needPrivacy && (
            <section style={{ padding: '0.9rem 1rem', borderRadius: 10, background: '#F7FEE7', border: '1px solid #D9F09E', display: 'grid', gap: '0.65rem' }}>
              <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#3F6212', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span aria-hidden>🔒</span>
                <span>개인정보 수집 및 이용 동의 <span style={{ color: '#DC2626' }}>[필수]</span></span>
              </h2>

              <div style={{ display: 'grid', gap: '0.55rem', fontSize: '0.82rem', color: '#4B5563', lineHeight: 1.6 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, color: '#365314' }}>1. 수집 항목 및 목적</p>
                  <p style={{ margin: '0.15rem 0 0' }}>
                    <strong style={{ color: '#365314' }}>수집 항목:</strong> 이메일·닉네임 (카카오/구글 소셜 로그인 제공)
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
                    귀하는 정보 수집에 동의하지 않을 수 있습니다. 단, 이름과 연락처는 서비스 제공을 위한 <strong style={{ color: '#B91C1C' }}>필수 정보</strong>로, 입력을 거부하거나 허위 정보를 입력할 경우 회원가입 및 장소 예약 서비스 이용이 제한됩니다.
                  </p>
                  <p style={{ margin: '0.15rem 0 0', color: '#B91C1C' }}>
                    입력된 정보가 허위로 판명될 경우, 사전 고지 없이 예약이 임의로 취소될 수 있음을 알려드립니다.
                  </p>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.65rem 0.8rem', borderRadius: 8, background: '#fff', border: '1px solid #D9F09E', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={privacyChecked}
                  onChange={(e) => setPrivacyChecked(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: '#65A30D', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#3F6212', lineHeight: 1.5 }}>
                  본 사이트 이용을 위해 개인정보 수집 및 이용에 동의하십니까? <span style={{ color: '#DC2626' }}>*</span>
                </span>
              </label>
            </section>
          )}

          {error && <p style={{ margin: 0, fontSize: '0.82rem', color: '#DC2626', fontWeight: 700 }}>{error}</p>}

          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            style={{
              padding: '0.85rem 1rem',
              minHeight: 48,
              borderRadius: 10,
              border: 'none',
              background: submitting ? '#9CA3AF' : 'var(--color-primary)',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: submitting ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            {submitting ? '저장 중...' : '저장하고 계속'}
          </button>
          </div>
        </div>
      </main>
    </>
  );
};

export default CompleteSignupPage;
