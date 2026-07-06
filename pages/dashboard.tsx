import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TopNav from '../components/TopNav';
import { getProfiles, getUsers, getSignupApprovals } from '../lib/dataStore';
import { getSystemAdminHref } from '../lib/adminGuard';
import { getSessionProfileId } from '../lib/session';
import { useIsMobile } from '../lib/useIsMobile';

type Props = {
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

type Cell = {
  id: string;
  name: string;
  owner_profile_id: string;
  community_id: string | null;
  enabled_modes: { qt?: boolean; reading?: boolean; memorize?: boolean; prayer?: boolean };
  member_count: number;
};

type CommunityEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
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

  const [cells, setCells] = useState<Cell[] | null>(null);
  const [communityEvents, setCommunityEvents] = useState<Record<string, CommunityEvent[]>>({});

  const router = useRouter();
  const [inviteInput, setInviteInput] = useState('');
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem('kcisShowWelcome') === '1') {
        setShowWelcome(true);
        window.localStorage.removeItem('kcisShowWelcome');
      }
    } catch {}
  }, []);
  // 초대 링크(oncell.org/join/TOKEN) 전체 또는 코드만 붙여넣어도 토큰 추출
  const goJoin = () => {
    const raw = inviteInput.trim();
    if (!raw) return;
    const m = raw.match(/\/join\/([^/?#\s]+)/);
    const token = (m ? m[1] : raw.replace(/^.*\//, '')).trim();
    if (token) router.push(`/join/${encodeURIComponent(token)}`);
  };

  useEffect(() => {
    if (!profileId) { setCells([]); return; }
    (async () => {
      try {
        const r = await fetch(`/api/cells/my?profileId=${encodeURIComponent(profileId)}`);
        if (!r.ok) { setCells([]); return; }
        const d = await r.json();
        setCells(Array.isArray(d.cells) ? d.cells : []);
      } catch {
        setCells([]);
      }
    })();
  }, [profileId]);

  // 공동체 셀이 있으면 그 공동체의 다가오는 일정 7일치 fetch
  useEffect(() => {
    if (!cells) return;
    const communityIds = Array.from(new Set(cells.map((c) => c.community_id).filter(Boolean))) as string[];
    if (communityIds.length === 0) return;
    const today = new Date();
    const weekLater = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const from = fmt(today);
    const to = fmt(weekLater);
    Promise.all(communityIds.map(async (cid) => {
      try {
        const qs = new URLSearchParams({ communityId: cid, type: 'event', from, to });
        const r = await fetch(`/api/events?${qs}`);
        if (!r.ok) return [cid, [] as CommunityEvent[]];
        const d = await r.json();
        return [cid, Array.isArray(d.events) ? d.events.slice(0, 5) : []] as [string, CommunityEvent[]];
      } catch {
        return [cid, [] as CommunityEvent[]];
      }
    })).then((entries) => {
      const map: Record<string, CommunityEvent[]> = {};
      for (const [cid, evs] of entries) map[cid as string] = evs as CommunityEvent[];
      setCommunityEvents(map);
    });
  }, [cells]);

  // 별칭(nickname) 우선. 이메일 형태 값은 인사말에 쓰지 않음(없으면 '환영합니다').
  const cleanNick = nickname && !nickname.includes('@') ? nickname : null;
  const cleanReal = displayName && !displayName.includes('@') ? displayName : null;
  const name = cleanNick || cleanReal || '';
  const independentCells = (cells || []).filter((c) => !c.community_id);
  const communityCellsByCid: Record<string, Cell[]> = {};
  for (const c of cells || []) {
    if (c.community_id) {
      (communityCellsByCid[c.community_id] = communityCellsByCid[c.community_id] || []).push(c);
    }
  }
  const communityIds = Object.keys(communityCellsByCid);
  const hasCells = (cells?.length || 0) > 0;

  return (
    <>
      <Head><title>대시보드 · ONCELL</title></Head>

      <div style={{ minHeight: '100vh' }}>
          <TopNav profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />

        <main style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '1.5rem 1rem 4rem' : '3rem 1.5rem 5rem', color: '#fff' }}>

          <h1 style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 800, color: '#fff', margin: '0 0 0.4rem' }}>
            {name ? `${name} 님,` : '환영합니다'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.92rem', margin: '0 0 2rem' }}>
            오늘도 영적 한 걸음, 함께 가요.
          </p>

          {/* 공동체별 카드 — 일정 + 그 안의 내 셀 */}
          {communityIds.map((cid) => {
            const myCells = communityCellsByCid[cid];
            const events = communityEvents[cid] || [];
            return (
              <section key={cid} style={{ marginBottom: '1.75rem', padding: isMobile ? '1.1rem' : '1.4rem', borderRadius: 16, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', color: '#182527', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.04em', marginBottom: '0.15rem' }}>공동체</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{cid}</div>
                  </div>
                  <Link href="/schedule" style={{ fontSize: '0.78rem', color: '#0891B2', textDecoration: 'none', fontWeight: 600 }}>일정 전체 →</Link>
                </div>

                {/* 다가오는 일정 */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600, marginBottom: '0.5rem' }}>이번 주 일정</div>
                  {events.length === 0 ? (
                    <div style={{ color: '#94A3B8', fontSize: '0.82rem' }}>예정된 일정이 없습니다</div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.4rem' }}>
                      {events.map((e) => (
                        <li key={e.id} style={{ fontSize: '0.85rem', color: '#334155', display: 'flex', gap: '0.6rem' }}>
                          <span style={{ color: '#94A3B8', minWidth: 60 }}>{new Date(e.startAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span>
                          <span style={{ flex: 1 }}>{e.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 그 공동체 안의 내 셀 */}
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600, marginBottom: '0.5rem' }}>내 셀 ({myCells.length})</div>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {myCells.map((c) => <CellRow key={c.id} cell={c} ownProfileId={profileId} />)}
                  </div>
                </div>
              </section>
            );
          })}

          {/* 독립 셀 섹션 */}
          {independentCells.length > 0 && (
            <section style={{ marginBottom: '1.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>내 셀</h2>
                <Link href="/cells/new" style={{ fontSize: '0.78rem', color: '#A5F3FC', textDecoration: 'none' }}>+ 만들기</Link>
              </div>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {independentCells.map((c) => <CellRow key={c.id} cell={c} ownProfileId={profileId} />)}
              </div>
            </section>
          )}

          {/* 셀 0개일 때 온보딩 — 2갈래(초대 참여 / 직접 만들기) */}
          {cells !== null && !hasCells && (
            <section style={{ marginBottom: '1.75rem', display: 'grid', gap: '1rem' }}>
              {showWelcome && (
                <div style={{ padding: '1rem 1.25rem', borderRadius: 14, background: 'rgba(165,243,252,0.12)', border: '1px solid rgba(165,243,252,0.3)' }}>
                  <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.2rem' }}>환영합니다{name ? `, ${name}님` : ''} 🎉</div>
                  <div style={{ fontSize: '0.86rem', color: 'rgba(255,255,255,0.7)' }}>아래에서 시작 방법을 골라보세요.</div>
                </div>
              )}
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>이렇게 시작해요</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.85rem' }}>
                {/* ① 초대받아 참여 */}
                <div style={{ padding: '1.25rem', borderRadius: 16, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', color: '#182527', display: 'grid', gap: '0.55rem', alignContent: 'start' }}>
                  <div style={{ fontSize: '1.5rem' }}>🔗</div>
                  <div style={{ fontWeight: 700 }}>초대받아 참여</div>
                  <div style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.5 }}>받은 초대 링크나 코드를 붙여넣으세요.</div>
                  <input
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') goJoin(); }}
                    placeholder="초대 링크 또는 코드"
                    style={{ padding: '0.6rem 0.75rem', borderRadius: 10, border: '1px solid #D9E2EC', fontSize: '0.88rem', minHeight: 44, color: '#182527' }}
                  />
                  <button onClick={goJoin} disabled={!inviteInput.trim()} style={{ minHeight: 44, borderRadius: 10, border: 'none', background: inviteInput.trim() ? '#0891B2' : '#CBD5E1', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: inviteInput.trim() ? 'pointer' : 'default' }}>참여하기</button>
                </div>
                {/* ② 직접 셀 만들기 */}
                <Link href="/cells/new" style={{ padding: '1.25rem', borderRadius: 16, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#182527', display: 'grid', gap: '0.55rem', alignContent: 'start' }}>
                  <div style={{ fontSize: '1.5rem' }}>✨</div>
                  <div style={{ fontWeight: 700 }}>직접 셀 만들기</div>
                  <div style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.5 }}>내 셀을 만들고 친구를 초대해 함께 시작해요.</div>
                  <span style={{ marginTop: '0.2rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 10, background: '#A5F3FC', color: '#2D3850', fontWeight: 700, fontSize: '0.88rem' }}>+ 셀 만들기</span>
                </Link>
              </div>
            </section>
          )}

          {/* 개인 도구 — 큐티 / 통독 */}
          <section>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', margin: '0 0 0.85rem', letterSpacing: '0.02em' }}>개인 영적 기록</h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '0.85rem' }}>
              <Link href="/qt" style={{ padding: '1.15rem', borderRadius: 14, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#182527' }}>
                <div style={{ fontSize: '1.3rem', marginBottom: '0.3rem' }}>📖</div>
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>오늘의 큐티</div>
                <div style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.5 }}>매일 본문·묵상 노트</div>
              </Link>
              <Link href="/reading" style={{ padding: '1.15rem', borderRadius: 14, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#182527' }}>
                <div style={{ fontSize: '1.3rem', marginBottom: '0.3rem' }}>📜</div>
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>성경 통독</div>
                <div style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.5 }}>오늘의 분량 + 진도</div>
              </Link>
            </div>
          </section>

        </main>
      </div>
    </>
  );
};

const CellRow = ({ cell, ownProfileId }: { cell: Cell; ownProfileId: string | null }) => {
  const modes: string[] = [];
  if (cell.enabled_modes?.qt) modes.push('큐티');
  if (cell.enabled_modes?.reading) modes.push('통독');
  if (cell.enabled_modes?.memorize) modes.push('암송');
  if (cell.enabled_modes?.prayer) modes.push('🙏 기도');
  return (
    <Link href={`/cells/${cell.id}`} style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', textDecoration: 'none', color: '#182527', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell.name}</div>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {modes.map((m) => (
            <span key={m} style={{ fontSize: '0.66rem', padding: '0.12rem 0.45rem', borderRadius: 999, background: 'rgba(8,145,178,0.1)', color: '#0891B2', fontWeight: 600 }}>{m}</span>
          ))}
          {cell.owner_profile_id === ownProfileId && (
            <span style={{ fontSize: '0.66rem', padding: '0.12rem 0.45rem', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: '#64748B' }}>owner</span>
          )}
        </div>
      </div>
      <span style={{ fontSize: '0.78rem', color: '#94A3B8', flexShrink: 0 }}>{cell.member_count}명</span>
    </Link>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  // 신원은 세션 쿠키에서 (URL 쿼리 신뢰 제거)
  const profileId = getSessionProfileId(context.req);
  let displayName: string | null = null;
  let nickname: string | null = null;
  let email: string | null = null;
  if (profileId) {
    try {
      const [profiles, users, approvals] = await Promise.all([
        getProfiles().catch(() => [] as any[]),
        getUsers().catch(() => [] as any[]),
        getSignupApprovals().catch(() => [] as any[]),
      ]);
      const p = (profiles as Array<any>).find((x) => x.profileId === profileId);
      const u = (users as Array<any>).find((x) => x.providerProfileId === profileId);
      const a = (approvals as Array<any>).find((x) => x.profileId === profileId);
      nickname = a?.nickname || p?.nickname || u?.nickname || null;
      email = a?.email || p?.email || null;
      displayName = p?.realName || u?.realName || u?.nickname || nickname || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  return { props: { profileId, displayName, nickname, email, systemAdminHref } };
};

export default Dashboard;
