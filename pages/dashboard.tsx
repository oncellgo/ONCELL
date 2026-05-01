import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopNav from '../components/TopNav';
import { getProfiles, getUsers } from '../lib/dataStore';
import { getSystemAdminHref } from '../lib/adminGuard';
import { useIsMobile } from '../lib/useIsMobile';

type Props = {
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const Dashboard = ({ profileId: ssrProfileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [profileId, setProfileId] = useState<string | null>(ssrProfileId);
  useEffect(() => {
    if (profileId) return;
    try {
      const pid = window.localStorage.getItem('kcisProfileId');
      if (pid) setProfileId(pid);
    } catch {}
  }, [profileId]);

  const [cellCount, setCellCount] = useState<number | null>(null);
  useEffect(() => {
    if (!profileId) return;
    (async () => {
      try {
        const r = await fetch(`/api/cells/my?profileId=${encodeURIComponent(profileId)}`);
        if (!r.ok) return;
        const d = await r.json();
        setCellCount(Array.isArray(d.cells) ? d.cells.length : 0);
      } catch {}
    })();
  }, [profileId]);

  const name = displayName || nickname || (email ? email.split('@')[0] : '');
  const hasCells = cellCount !== null && cellCount > 0;

  return (
    <>
      <Head><title>대시보드 · ONCELL</title></Head>

      <div style={{ minHeight: '100vh' }}>
        <div style={{ padding: isMobile ? '0.5rem 0.5rem 0' : '0.75rem 0.75rem 0', maxWidth: 1040, margin: '0 auto', width: '100%' }}>
          <TopNav profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        </div>

        <main style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '1.5rem 1rem 4rem' : '3rem 1.5rem 5rem', color: '#fff' }}>

          <h1 style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 800, color: '#fff', margin: '0 0 0.5rem' }}>
            {name ? `${name} 님,` : '환영합니다'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.95rem', lineHeight: 1.7, margin: '0 0 2rem' }}>
            ONCELL에 오신 것을 환영해요. 셀과 공동체 기능은 곧 열립니다.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '0.85rem', marginBottom: '2rem' }}>
            <a href="/qt" style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none', color: '#fff' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>📖</div>
              <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>오늘의 큐티</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>매일 본문·묵상 노트</div>
            </a>
            <a href="/reading" style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none', color: '#fff' }}>
              <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>📜</div>
              <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>성경 통독</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>오늘의 분량 + 진도</div>
            </a>
          </div>

          {hasCells ? (
            <a href="/cells" style={{ display: 'block', padding: '1.5rem', borderRadius: 16, background: 'rgba(165,243,252,0.08)', border: '1px solid rgba(165,243,252,0.32)', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>✨</div>
              <div style={{ fontWeight: 700, color: '#A5F3FC', marginBottom: '0.5rem' }}>내 셀 ({cellCount})</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.9rem', lineHeight: 1.65 }}>
                가입한 셀로 이동해서 오늘의 인증을 남겨보세요.
              </div>
            </a>
          ) : (
            <div style={{ padding: '1.75rem 1.5rem', borderRadius: 16, background: 'rgba(165,243,252,0.08)', border: '1px solid rgba(165,243,252,0.32)', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>✨</div>
              <div style={{ fontWeight: 700, color: '#A5F3FC', marginBottom: '0.5rem', fontSize: '1.05rem' }}>아직 가입한 셀이 없어요</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem', lineHeight: 1.65, marginBottom: '1.25rem' }}>
                친구들과 매일 5분 영적 동행을 시작해보세요.
              </div>
              <a href="/cells/new" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0.7rem 1.4rem', borderRadius: 12, background: '#A5F3FC', color: '#2D3850', fontWeight: 700, fontSize: '0.92rem', textDecoration: 'none' }}>
                + 내 셀 만들기
              </a>
            </div>
          )}

        </main>
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const nickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const email = typeof context.query.email === 'string' ? context.query.email : null;

  let displayName: string | null = nickname;
  if (profileId) {
    try {
      const [profiles, users] = await Promise.all([
        getProfiles().catch(() => [] as any[]),
        getUsers().catch(() => [] as any[]),
      ]);
      const p = (profiles as Array<any>).find((x) => x.profileId === profileId);
      const u = (users as Array<any>).find((x) => x.providerProfileId === profileId);
      displayName = p?.realName || u?.realName || u?.nickname || nickname || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  return { props: { profileId, displayName, nickname, email, systemAdminHref } };
};

export default Dashboard;
