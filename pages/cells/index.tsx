import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import TopNav from '../../components/TopNav';
import { useIsMobile } from '../../lib/useIsMobile';
import { getSystemAdminHref } from '../../lib/adminGuard';

type Cell = {
  id: string;
  name: string;
  owner_profile_id: string;
  community_id: string | null;
  enabled_modes: { qt?: boolean; reading?: boolean; memorize?: boolean };
  member_count: number;
  description: string | null;
};

type Props = {
  profileId: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

export default function CellsIndex({ profileId, nickname, email, systemAdminHref }: Props) {
  const isMobile = useIsMobile();
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      try {
        const r = await fetch(`/api/cells/my?profileId=${encodeURIComponent(profileId)}`);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `${r.status}`);
        const d = await r.json();
        setCells(d.cells || []);
      } catch (e: any) {
        setErr(e?.message || '셀 목록을 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId]);

  return (
    <>
      <Head><title>내 셀 · ONCELL</title></Head>
      <div style={{ minHeight: '100vh' }}>
        <div style={{ padding: isMobile ? '0.5rem 0.5rem 0' : '0.75rem 0.75rem 0', maxWidth: 1040, margin: '0 auto' }}>
          <TopNav profileId={profileId} displayName={null} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        </div>
        <main style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '1.5rem 1rem 4rem' : '3rem 1.5rem 5rem', color: '#fff' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: isMobile ? '1.4rem' : '1.75rem', fontWeight: 800, margin: 0 }}>내 셀</h1>
            <Link href="/cells/new" style={{ padding: '0.6rem 1rem', minHeight: 40, display: 'inline-flex', alignItems: 'center', borderRadius: 12, background: '#fff', color: '#2D3850', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none' }}>
              + 셀 만들기
            </Link>
          </div>

          {!profileId && (
            <div style={{ padding: '1.25rem', borderRadius: 12, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.78)', textAlign: 'center' }}>
              로그인 후 이용해주세요. <Link href="/auth/login" style={{ color: '#A5F3FC', textDecoration: 'underline' }}>로그인</Link>
            </div>
          )}

          {profileId && loading && <div style={{ color: 'rgba(255,255,255,0.6)' }}>불러오는 중…</div>}
          {profileId && err && <div style={{ color: '#FCA5A5' }}>오류: {err}</div>}
          {profileId && !loading && !err && cells.length === 0 && (
            <div style={{ padding: '2rem 1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✨</div>
              <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>아직 셀이 없어요</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>친구들과 매일 5분 영적 동행을 시작해보세요</div>
              <Link href="/cells/new" style={{ padding: '0.7rem 1.4rem', minHeight: 44, display: 'inline-flex', alignItems: 'center', borderRadius: 12, background: '#A5F3FC', color: '#2D3850', fontWeight: 700, textDecoration: 'none' }}>
                첫 셀 만들기
              </Link>
            </div>
          )}

          {profileId && !loading && !err && cells.length > 0 && (
            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {cells.map((c) => {
                const modes: string[] = [];
                if (c.enabled_modes?.qt) modes.push('큐티');
                if (c.enabled_modes?.reading) modes.push('통독');
                if (c.enabled_modes?.memorize) modes.push('암송');
                return (
                  <Link key={c.id} href={`/cells/${c.id}`} style={{ padding: '1.15rem', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none', color: '#fff', display: 'block' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.35rem' }}>{c.name}</div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                      {modes.map((m) => (
                        <span key={m} style={{ fontSize: '0.7rem', padding: '0.18rem 0.55rem', borderRadius: 999, background: 'rgba(165,243,252,0.15)', color: '#A5F3FC', fontWeight: 600 }}>{m}</span>
                      ))}
                      {c.community_id && (
                        <span style={{ fontSize: '0.7rem', padding: '0.18rem 0.55rem', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>공동체 셀</span>
                      )}
                      {c.owner_profile_id === profileId && (
                        <span style={{ fontSize: '0.7rem', padding: '0.18rem 0.55rem', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>owner</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)' }}>멤버 {c.member_count}명</div>
                  </Link>
                );
              })}
            </div>
          )}

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
