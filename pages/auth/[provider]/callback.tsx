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

        try {
          if (nickname) window.localStorage.setItem('kcisNickname', nickname);
          if (email) window.localStorage.setItem('kcisEmail', email);
          window.localStorage.setItem('kcisProfileId', profileId);
        } catch {}

        // 로그인 페이지 사전 동의 플래그(있으면 신규 가입 시 approval 에 바로 반영)
        let pendingPrivacyConsent = false;
        try { pendingPrivacyConsent = window.localStorage.getItem('kcisPrivacyConsented') === '1'; } catch {}

        let approvalStatus: 'approved' | 'pending' | 'rejected' | 'blocked' = 'approved';
        let missingFields: string[] = [];
        try {
          const loginRes = await fetch('/api/auth/record-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId, provider: providerName, nickname, email, privacyConsent: pendingPrivacyConsent || undefined }),
          });
          const loginData = await loginRes.json().catch(() => ({}));
          if (!loginRes.ok && loginData?.error === 'blocked') {
            approvalStatus = 'blocked';
          } else if (loginRes.ok) {
            approvalStatus = loginData?.approval?.status || 'approved';
            if (Array.isArray(loginData?.missingFields)) missingFields = loginData.missingFields;
          }
        } catch {}

        if (approvalStatus === 'blocked') {
          try {
            window.localStorage.removeItem('kcisProfileId');
            window.localStorage.removeItem('kcisNickname');
            window.localStorage.removeItem('kcisEmail');
          } catch {}
          router.replace('/auth/blocked');
          return;
        }

        if (missingFields.length > 0) {
          const qs = new URLSearchParams({
            profileId,
            nickname,
            email,
            fields: missingFields.join(','),
            next: approvalStatus,
          });
          router.replace(`/auth/complete?${qs.toString()}`);
          return;
        }

        if (approvalStatus === 'pending') {
          router.replace('/auth/pending');
          return;
        }
        if (approvalStatus === 'rejected') {
          router.replace('/auth/rejected');
          return;
        }

        router.replace(
          `/?profileId=${encodeURIComponent(profileId)}&nickname=${encodeURIComponent(nickname)}&email=${encodeURIComponent(email)}`,
        );
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
