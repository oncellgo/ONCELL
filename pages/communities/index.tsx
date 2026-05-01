import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import TopNav from '../../components/TopNav';
import { useIsMobile } from '../../lib/useIsMobile';
import { getSystemAdminHref } from '../../lib/adminGuard';

type Community = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  approval_mode: 'auto' | 'manual';
};

type Props = {
  profileId: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

export default function CommunitiesIndex({ profileId: ssrProfileId, nickname: ssrNickname, email: ssrEmail, systemAdminHref }: Props) {
  const isMobile = useIsMobile();
  const [profileId, setProfileId] = useState<string | null>(ssrProfileId);
  const [nickname, setNickname] = useState<string | null>(ssrNickname);
  const [email, setEmail] = useState<string | null>(ssrEmail);
  useEffect(() => {
    if (profileId) return;
    try {
      const pid = window.localStorage.getItem('kcisProfileId');
      const nick = window.localStorage.getItem('kcisNickname');
      const em = window.localStorage.getItem('kcisEmail');
      if (pid) setProfileId(pid);
      if (nick) setNickname(nick);
      if (em) setEmail(em);
    } catch {}
  }, [profileId]);

  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/communities');
        if (!r.ok) return;
        const d = await r.json();
        setCommunities(d.communities || []);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <>
      <Head><title>공동체 찾기 · ONCELL</title></Head>
      <div style={{ minHeight: '100vh' }}>
        <TopNav profileId={profileId} displayName={null} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '1.25rem 1rem 4rem' : '2.5rem 1.5rem 5rem', color: '#fff' }}>

          <h1 style={{ fontSize: isMobile ? '1.4rem' : '1.75rem', fontWeight: 800, margin: '0 0 0.4rem' }}>공동체 찾기</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>관심 있는 공동체에 가입해서 함께하세요.</p>

          {loading && <div style={{ color: 'rgba(255,255,255,0.6)' }}>불러오는 중…</div>}

          {!loading && communities.length === 0 && (
            <div style={{ padding: '1.5rem', borderRadius: 16, background: '#fff', color: '#182527', textAlign: 'center' }}>
              아직 등록된 공동체가 없어요.
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {communities.map((c) => (
              <Link key={c.id} href={`/community/${c.id}`} style={{ display: 'block', padding: '1.15rem', borderRadius: 14, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#182527' }}>
                <div style={{ fontWeight: 700, fontSize: '1.02rem', marginBottom: '0.3rem' }}>{c.name}</div>
                {c.description && <div style={{ fontSize: '0.86rem', color: '#475569', marginBottom: '0.45rem', lineHeight: 1.55 }}>{c.description}</div>}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: '#475569', fontWeight: 600 }}>멤버 {c.member_count}명</span>
                  {c.approval_mode === 'manual' && <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: 999, background: '#FEF3C7', color: '#78350F', fontWeight: 600 }}>수동승인</span>}
                </div>
              </Link>
            ))}
          </div>

        </main>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const nickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const email = typeof context.query.email === 'string' ? context.query.email : null;
  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  return { props: { profileId, nickname, email, systemAdminHref } };
};
