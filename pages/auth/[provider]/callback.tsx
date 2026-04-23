import { useRouter } from 'next/router';
import { useEffect } from 'react';

const CallbackPage = () => {
  const router = useRouter();
  const { provider } = router.query;

  useEffect(() => {
    if (!router.isReady) return;

    const providerName = typeof provider === 'string' ? provider : 'kakao';
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const errorDescription = urlParams.get('error_description');

    if (errorDescription || !code) {
      router.replace('/');
      return;
    }

    const run = async () => {
      try {
        const response = await fetch(`/api/auth/${providerName}/token?code=${encodeURIComponent(code)}`);
        const data = await response.json();
        if (!response.ok) {
          console.error('Token exchange error:', data);
          router.replace('/');
          return;
        }
        const profileData = data.profile || data;
        let profileId = '';
        let nickname = '';
        let email = '';
        if (providerName === 'google') {
          const sub = profileData?.sub || profileData?.id;
          profileId = sub ? `google-${sub}` : '';
          nickname = profileData?.name || (profileData?.email ? String(profileData.email).split('@')[0] : '');
          email = profileData?.email || '';
        } else {
          profileId = profileData?.id
            ? `${providerName}-${profileData.id}`
            : (profileData?.kakao_account?.email || profileData?.properties?.nickname || '');
          nickname = profileData?.properties?.nickname || profileData?.kakao_account?.email || '';
          email = profileData?.kakao_account?.email || '';
        }

        if (!profileId) {
          router.replace('/');
          return;
        }

        // A 방안: 동의 전까지는 서버 record-login 호출·localStorage 저장을 모두 유보.
        // OAuth 프로필은 sessionStorage 에 임시 보관 (탭 닫거나 이탈 시 자동 소멸).
        try {
          window.sessionStorage.setItem('kcisPendingProfile', JSON.stringify({ profileId, nickname, email, provider: providerName }));
        } catch {}

        // 수집 없이 기존 상태만 조회 — 기존 가입자 + 이미 동의한 경우를 구분해 건너뛰기 위함.
        let exists = false;
        let privacyConsent = false;
        let status: 'pending' | 'approved' | 'rejected' | 'blocked' | null = null;
        try {
          const checkRes = await fetch(`/api/auth/check-status?profileId=${encodeURIComponent(profileId)}`);
          if (checkRes.ok) {
            const d = await checkRes.json();
            exists = !!d?.exists;
            privacyConsent = !!d?.privacyConsent;
            status = (d?.status as typeof status) || null;
          }
        } catch {}

        // 차단된 계정은 동의 여부와 무관하게 즉시 차단.
        if (status === 'blocked') {
          try {
            window.sessionStorage.removeItem('kcisPendingProfile');
          } catch {}
          router.replace('/auth/blocked');
          return;
        }

        // 기존 가입자 + 이미 동의 완료: 즉시 로그인 처리 (record-login 호출해 lastLoginAt 갱신).
        if (exists && privacyConsent) {
          try {
            await fetch('/api/auth/record-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profileId, provider: providerName, nickname, email }),
            });
          } catch {}
          try {
            if (nickname) window.localStorage.setItem('kcisNickname', nickname);
            if (email) window.localStorage.setItem('kcisEmail', email);
            window.localStorage.setItem('kcisProfileId', profileId);
            window.sessionStorage.removeItem('kcisPendingProfile');
          } catch {}

          if (status === 'pending') { router.replace('/auth/pending'); return; }
          if (status === 'rejected') { router.replace('/auth/rejected'); return; }
          router.replace(`/dashboard?profileId=${encodeURIComponent(profileId)}&nickname=${encodeURIComponent(nickname)}&email=${encodeURIComponent(email)}`);
          return;
        }

        // 그 외(신규 또는 소급 동의 필요): /auth/complete 로. 서버 저장 없음.
        const qs = new URLSearchParams({ provider: providerName });
        router.replace(`/auth/complete?${qs.toString()}`);
        return;
      } catch (error) {
        console.error(error);
        router.replace('/');
      }
    };

    run();
  }, [provider, router.isReady, router]);

  return (
    <main style={{
      minHeight: '100vh',
      background: 'transparent',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '1.5rem',
      padding: '1rem',
      fontFamily: "var(--font-sans, 'Noto Sans KR', sans-serif)",
      color: '#2D4048',
    }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', border: '4px solid #CCF4E5', borderTopColor: '#20CD8D', animation: 'spin 0.8s linear infinite', display: 'block' }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#2D4048' }}>로그인 처리 중입니다...</div>
        <div style={{ marginTop: '0.4rem', fontSize: '0.83rem', color: '#6B7280' }}>잠시만 기다려주세요.</div>
      </div>
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
};

export default CallbackPage;
