import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import TopNav from '../../../components/TopNav';
import { useIsMobile } from '../../../lib/useIsMobile';
import { getSystemAdminHref } from '../../../lib/adminGuard';

type Community = {
  id: string;
  name: string;
  description: string | null;
  admin_profile_id: string;
  adminDisplayName: string;
  approval_mode: 'auto' | 'manual';
  cell_join_limit: number;
};

type Cell = {
  id: string;
  name: string;
  owner_profile_id: string;
  enabled_modes: { qt?: boolean; reading?: boolean; memorize?: boolean; prayer?: boolean };
  member_count: number;
  description: string | null;
};

type Props = {
  profileId: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const MODE_BADGES: Record<string, { label: string; color: string }> = {
  qt: { label: '큐티', color: '#0891B2' },
  reading: { label: '통독', color: '#7C3AED' },
  memorize: { label: '암송', color: '#B45309' },
  prayer: { label: '🙏 기도', color: '#BE185D' },
};

export default function CommunityDetail({ profileId: ssrProfileId, nickname: ssrNickname, email: ssrEmail, systemAdminHref }: Props) {
  const router = useRouter();
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

  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const [community, setCommunity] = useState<Community | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const reload = async () => {
    if (!id) return;
    try {
      const qs = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
      const r = await fetch(`/api/communities/${encodeURIComponent(id)}${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.errorReason || d.error || `${r.status}`);
      setCommunity(d.community);
      setMemberCount(d.memberCount || 0);
      setIsMember(d.isMember);
      setIsAdmin(d.isAdmin);
      setCells(d.cells || []);
    } catch (e: any) {
      setErr(e?.message || '공동체 정보를 불러오지 못했어요');
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, [id, profileId]);

  const join = async () => {
    if (!profileId) {
      const ret = encodeURIComponent(`/community/${id}`);
      window.location.href = `/auth/login?return=${ret}`;
      return;
    }
    setJoining(true);
    setErr(null);
    try {
      const r = await fetch(`/api/communities/${encodeURIComponent(id)}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.errorReason || d.error || `${r.status}`);
      // 낙관적 업데이트 — reload 결과 기다리지 말고 즉시 반영
      if (d.status === 'approved') {
        setIsMember(true);
        setMemberCount((prev) => prev + 1);
      }
      if (d.status === 'pending') alert('가입 신청 완료. 공동체관리자 승인이 필요합니다.');
      await reload();
    } catch (e: any) {
      setErr(e?.message || '가입 실패');
    } finally { setJoining(false); }
  };

  return (
    <>
      <Head><title>{community?.name || '공동체'} · ONCELL</title></Head>
      <div style={{ minHeight: '100vh' }}>
        <TopNav profileId={profileId} displayName={null} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '1.25rem 1rem 4rem' : '2.5rem 1.5rem 5rem', color: '#fff' }}>

          <a href="/communities" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', minHeight: 36, borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)', fontSize: '0.82rem', textDecoration: 'none', marginBottom: '1.25rem', fontWeight: 600 }}>
            ← 공동체 찾기
          </a>

          {loading && <div style={{ color: 'rgba(255,255,255,0.6)' }}>불러오는 중…</div>}
          {err && <div style={{ padding: '1rem', borderRadius: 12, background: '#FEE2E2', color: '#991B1B' }}>{err}</div>}

          {community && (
            <>
              {/* 헤더 카드 */}
              <section style={{ padding: isMobile ? '1.25rem' : '1.5rem', borderRadius: 16, background: '#fff', color: '#182527', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', marginBottom: '1.25rem' }}>
                <h1 style={{ fontSize: isMobile ? '1.4rem' : '1.75rem', fontWeight: 800, margin: '0 0 0.4rem' }}>{community.name}</h1>
                {community.description && <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.65, margin: '0 0 0.75rem' }}>{community.description}</p>}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.74rem', padding: '0.18rem 0.55rem', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: '#475569', fontWeight: 600 }}>멤버 {memberCount}명</span>
                  <span style={{ fontSize: '0.74rem', padding: '0.18rem 0.55rem', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: '#475569', fontWeight: 600 }}>셀 {cells.length}개</span>
                  <span style={{ fontSize: '0.74rem', padding: '0.18rem 0.55rem', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: '#475569', fontWeight: 600 }}>관리자 {community.adminDisplayName}</span>
                  {community.approval_mode === 'manual' && <span style={{ fontSize: '0.74rem', padding: '0.18rem 0.55rem', borderRadius: 999, background: '#FEF3C7', color: '#78350F', fontWeight: 600 }}>수동승인</span>}
                </div>

                {/* 멤버십 상태 — loading 중엔 둘 다 안 보이게 */}
                {!loading && (
                  isMember || isAdmin ? (
                    <div style={{ padding: '0.7rem', borderRadius: 10, background: '#ECFDF5', color: '#065F46', fontSize: '0.88rem', textAlign: 'center', fontWeight: 600 }}>
                      ✓ {isAdmin ? '공동체 관리자' : '공동체 멤버'}
                    </div>
                  ) : (
                    <button onClick={join} disabled={joining} style={{ width: '100%', padding: '0.85rem', minHeight: 48, borderRadius: 12, background: joining ? '#94A3B8' : '#2D3850', color: '#fff', fontWeight: 700, fontSize: '0.95rem', border: 'none', cursor: joining ? 'wait' : 'pointer' }}>
                      {joining ? '신청 중…' : '공동체 가입 신청'}
                    </button>
                  )
                )}
              </section>

              {/* 산하 셀 */}
              <section style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>공동체 셀 ({cells.length})</h2>
                  {isAdmin && <Link href={`/cells/new?community=${community.id}`} style={{ fontSize: '0.78rem', color: '#A5F3FC', textDecoration: 'none' }}>+ 셀 만들기</Link>}
                </div>
                {cells.length === 0 ? (
                  <div style={{ padding: '1.25rem', borderRadius: 12, background: '#fff', color: '#475569', textAlign: 'center', fontSize: '0.88rem' }}>
                    아직 등록된 셀이 없어요{isAdmin ? '. + 셀 만들기로 시작해보세요.' : '.'}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {cells.map((c) => (
                      <Link key={c.id} href={`/cells/${c.id}`} style={{ padding: '0.95rem 1rem', borderRadius: 12, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#182527', display: 'block' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem' }}>{c.name}</div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                          {Object.entries(c.enabled_modes || {}).filter(([, v]) => v).map(([k]) => {
                            const b = MODE_BADGES[k];
                            return b ? <span key={k} style={{ fontSize: '0.66rem', padding: '0.12rem 0.45rem', borderRadius: 999, background: `${b.color}1A`, color: b.color, fontWeight: 600 }}>{b.label}</span> : null;
                          })}
                          <span style={{ fontSize: '0.66rem', padding: '0.12rem 0.45rem', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: '#64748B' }}>{c.member_count}명</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

            </>
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
