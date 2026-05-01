import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import TopNav from '../../components/TopNav';
import { useIsMobile } from '../../lib/useIsMobile';
import { getSystemAdminHref } from '../../lib/adminGuard';

type Cell = {
  id: string;
  name: string;
  owner_profile_id: string;
  community_id: string | null;
  approval_mode: 'auto' | 'manual';
  invite_token: string;
  enabled_modes: { qt?: boolean; reading?: boolean; memorize?: boolean; prayer?: boolean };
  description: string | null;
  invite_message: string | null;
  member_count: number;
};

type Member = {
  profileId: string;
  displayName: string;
  joinedAt: string;
  isOwner: boolean;
};

type Props = {
  profileId: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

type ModeKey = 'qt' | 'reading' | 'memorize' | 'prayer';
const MODE_LABELS: Record<ModeKey, { ko: string; icon: string; color: string }> = {
  qt:       { ko: '큐티',     icon: '📖', color: '#A5F3FC' },
  reading:  { ko: '통독',     icon: '📜', color: '#C4B5FD' },
  memorize: { ko: '암송',     icon: '✨', color: '#FCD34D' },
  prayer:   { ko: '기도 나눔', icon: '🙏', color: '#F9A8D4' },
};

const initial = (s: string) => (s || '?').trim().charAt(0).toUpperCase();
const colorFromName = (s: string) => {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

const Avatar = ({ name, size = 36, ring = false }: { name: string; size?: number; ring?: boolean }) => {
  const hue = colorFromName(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue} 60% 55% / 0.55)`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.42,
      flexShrink: 0,
      ...(ring ? { boxShadow: `0 0 0 2px rgba(165,243,252,0.7)`, outline: '2px solid #2D3850', outlineOffset: -4 } : {}),
    }}>
      {initial(name)}
    </div>
  );
};

// 시간 ago 표기
const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
};

// === Placeholder 데이터 (Phase 2에서 실제 데이터 연결) ===
type ActivityItem = {
  id: string;
  profileName: string;
  mode: ModeKey;
  text: string;
  meta: string;
  isoAt: string;
  prayerCount: number;
};
const MOCK_ACTIVITY: ActivityItem[] = [
  { id: 'a1', profileName: '한밤별', mode: 'qt',       text: '"심령이 가난한 자는 복이 있나니"가 오늘은 다르게 읽혔다', meta: '마태 5:3-12', isoAt: new Date(Date.now() - 60 * 60_000).toISOString(),       prayerCount: 12 },
  { id: 'a2', profileName: '새벽이슬', mode: 'reading',  text: '오늘 사도행전 5장 완료',                                meta: '237/365일', isoAt: new Date(Date.now() - 3 * 3600_000).toISOString(),   prayerCount: 5 },
  { id: 'a3', profileName: '빛여울',   mode: 'memorize', text: '빌립보서 4:6-7 외움 (95%)',                              meta: '7일 streak', isoAt: new Date(Date.now() - 6 * 3600_000).toISOString(),   prayerCount: 3 },
  { id: 'a4', profileName: '모래알',   mode: 'prayer',   text: '딸의 진로 결정. 기도 부탁드려요',                          meta: '셀 안에서만', isoAt: new Date(Date.now() - 12 * 3600_000).toISOString(),  prayerCount: 8 },
  { id: 'a5', profileName: '한밤별',   mode: 'reading',  text: '오늘 사도행전 6장 완료',                                meta: '142/365일', isoAt: new Date(Date.now() - 22 * 3600_000).toISOString(),  prayerCount: 2 },
];

export default function CellDetail({ profileId: ssrProfileId, nickname: ssrNickname, email: ssrEmail, systemAdminHref }: Props) {
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

  const cellId = typeof router.query.id === 'string' ? router.query.id : '';
  const [cell, setCell] = useState<Cell | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 본인 오늘 인증 상태 (placeholder — 추후 실제 데이터)
  const [doneToday, setDoneToday] = useState<Record<ModeKey, boolean>>({ qt: false, reading: false, memorize: false, prayer: false });

  useEffect(() => {
    if (!profileId || !cellId) return;
    (async () => {
      try {
        const r = await fetch(`/api/cells/${encodeURIComponent(cellId)}?profileId=${encodeURIComponent(profileId)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.errorReason || d.error || `${r.status}`);
        setCell(d.cell);
        setMembers(d.members || []);
      } catch (e: any) {
        setErr(e?.message || '셀 정보를 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId, cellId]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  const isOwner = !!cell && profileId === cell.owner_profile_id;
  const enabledModes = useMemo(() => {
    if (!cell) return [] as ModeKey[];
    const list: ModeKey[] = [];
    (['qt', 'reading', 'memorize', 'prayer'] as ModeKey[]).forEach((k) => { if (cell.enabled_modes?.[k]) list.push(k); });
    return list;
  }, [cell]);

  const [activeMode, setActiveMode] = useState<ModeKey>('qt');
  useEffect(() => {
    if (enabledModes.length > 0 && !enabledModes.includes(activeMode)) {
      setActiveMode(enabledModes[0]);
    }
  }, [enabledModes, activeMode]);

  const inviteUrl = cell ? `${typeof window !== 'undefined' ? window.location.origin : 'https://oncell.org'}/join/${cell.invite_token}` : '';

  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); showToast('초대 링크 복사됨'); } catch { showToast('복사 실패'); }
  };
  const shareUrl = async () => {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share({ title: `${cell?.name} 초대`, text: cell?.invite_message || `${cell?.name}에 초대합니다`, url: inviteUrl }); return; } catch {}
    }
    copyUrl();
  };

  const toggleDone = (m: ModeKey) => {
    setDoneToday((p) => ({ ...p, [m]: !p[m] }));
    if (!doneToday[m]) showToast(`✓ ${MODE_LABELS[m].ko} 인증되었어요`);
  };

  return (
    <>
      <Head><title>{cell?.name || '셀'} · ONCELL</title></Head>
      <div style={{ minHeight: '100vh' }}>
          <TopNav profileId={profileId} displayName={null} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        <main style={{ maxWidth: 620, margin: '0 auto', padding: isMobile ? '1.25rem 0.85rem 4rem' : '2.5rem 1.5rem 5rem', color: '#fff' }}>

          <a href="/cells" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', minHeight: 36, borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)', fontSize: '0.82rem', textDecoration: 'none', marginBottom: '1.25rem', fontWeight: 600 }}>
            ← 내 셀
          </a>

          {loading && <div style={{ color: 'rgba(255,255,255,0.6)' }}>불러오는 중…</div>}
          {err && <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.32)', color: '#FCA5A5' }}>{err}</div>}

          {cell && (
            <>
              {/* === 헤더 === */}
              <header style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h1 style={{ fontSize: isMobile ? '1.45rem' : '1.85rem', fontWeight: 800, margin: '0 0 0.4rem' }}>{cell.name}</h1>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {enabledModes.map((m) => (
                      <span key={m} style={{ fontSize: '0.7rem', padding: '0.18rem 0.55rem', borderRadius: 999, background: `${MODE_LABELS[m].color}26`, color: MODE_LABELS[m].color, fontWeight: 600 }}>
                        {MODE_LABELS[m].icon} {MODE_LABELS[m].ko}
                      </span>
                    ))}
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)' }}>· 멤버 {cell.member_count}명</span>
                  </div>
                </div>
                {isOwner && (
                  <button onClick={() => showToast('셀 설정은 준비 중')} title="셀 설정" style={{ padding: '0.55rem 0.7rem', minHeight: 40, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '1.05rem', cursor: 'pointer', flexShrink: 0 }}>⚙</button>
                )}
              </header>

              {/* === 1. 오늘의 활동 === */}
              <section style={{ marginBottom: '1.75rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '0.6rem', letterSpacing: '0.02em' }}>오늘의 활동</div>

                {/* Mode tabs */}
                <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.85rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  {enabledModes.map((m) => {
                    const active = activeMode === m;
                    return (
                      <button key={m} onClick={() => setActiveMode(m)} style={{
                        flexShrink: 0, padding: '0.5rem 0.95rem', minHeight: 38, borderRadius: 999,
                        background: active ? `${MODE_LABELS[m].color}26` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${active ? `${MODE_LABELS[m].color}66` : 'rgba(255,255,255,0.1)'}`,
                        color: active ? MODE_LABELS[m].color : 'rgba(255,255,255,0.7)',
                        fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer',
                      }}>
                        {MODE_LABELS[m].icon} {MODE_LABELS[m].ko}
                      </button>
                    );
                  })}
                </div>

                {/* Active mode card */}
                <TodayCard
                  mode={activeMode}
                  done={doneToday[activeMode]}
                  onToggle={() => toggleDone(activeMode)}
                  members={members}
                  ownProfileId={profileId}
                />
              </section>

              {/* === 2. 최근 활동 피드 === */}
              <section style={{ marginBottom: '1.75rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '0.6rem', letterSpacing: '0.02em' }}>최근 24시간 활동</div>
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {MOCK_ACTIVITY.filter((a) => enabledModes.includes(a.mode)).slice(0, 5).map((a) => (
                    <ActivityCard key={a.id} item={a} />
                  ))}
                </div>
                <p style={{ marginTop: '0.6rem', textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                  ※ 위 활동은 디자인 시안. 실제 데이터는 다음 단계에서 연결됩니다.
                </p>
              </section>

              {/* === 3. 멤버 === */}
              <section style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '0.6rem', letterSpacing: '0.02em' }}>멤버 ({members.length})</div>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {members.map((m) => (
                    <div key={m.profileId} style={{ padding: '0.6rem 0.8rem', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <Avatar name={m.displayName} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.displayName}
                          {m.isOwner && <span style={{ marginLeft: '0.4rem', fontSize: '0.66rem', padding: '0.08rem 0.4rem', borderRadius: 999, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>owner</span>}
                          {m.profileId === profileId && <span style={{ marginLeft: '0.3rem', fontSize: '0.66rem', color: 'rgba(255,255,255,0.5)' }}>(나)</span>}
                        </div>
                      </div>
                      {/* placeholder: 오늘 인증 여부 */}
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                        {m.profileId === profileId && doneToday[activeMode] ? '✓ 오늘' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* === 4. 초대 (compact, 하단) === */}
              <section style={{ padding: '1rem', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem' }}>친구 초대</div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <div style={{ flex: 1, fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', padding: '0.5rem 0.65rem', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>{inviteUrl}</div>
                  <button onClick={copyUrl} style={{ padding: '0.5rem 0.85rem', minHeight: 40, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>복사</button>
                  <button onClick={shareUrl} style={{ padding: '0.5rem 0.85rem', minHeight: 40, borderRadius: 8, background: '#A5F3FC', border: 'none', color: '#2D3850', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>공유</button>
                </div>
                {cell.approval_mode === 'manual' && <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.5rem' }}>* 수동승인 모드: owner 승인 필요</div>}
              </section>
            </>
          )}

          {toast && (
            <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '0.7rem 1.2rem', borderRadius: 999, background: '#fff', color: '#2D3850', fontSize: '0.88rem', fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 50 }}>
              {toast}
            </div>
          )}

        </main>
      </div>
    </>
  );
}

// === Today's mode card ===
const TodayCard = ({ mode, done, onToggle, members, ownProfileId }: { mode: ModeKey; done: boolean; onToggle: () => void; members: Member[]; ownProfileId: string | null }) => {
  const c = MODE_LABELS[mode].color;
  // placeholder — 실제 데이터는 mode별 API에서 가져올 예정
  const prompt = mode === 'qt' ? { ref: '마태복음 5:3-12', body: '"심령이 가난한 자는 복이 있나니..."' }
              : mode === 'reading' ? { ref: '오늘 분량', body: '사도행전 5-7장 (1년 1독)' }
              : mode === 'memorize' ? { ref: '이번 주 구절', body: '빌립보서 4:6-7' }
              : { ref: '기도 나눔', body: '셀 멤버만 보이는 기도제목 공간' };

  // placeholder: 셀 친구 ✓ 현황 (멤버 카운트의 60%가 했다고 가정)
  const doneCount = Math.max(0, Math.floor(members.length * 0.6)) + (done ? 1 : 0);
  const total = members.length + (done && !members.find((m) => m.profileId === ownProfileId) ? 1 : 0) || members.length;

  return (
    <div style={{ padding: '1.25rem', borderRadius: 16, background: `${c}10`, border: `1px solid ${c}40` }}>
      <div style={{ fontSize: '0.78rem', color: c, fontWeight: 700, marginBottom: '0.4rem' }}>{prompt.ref}</div>
      <div style={{ fontSize: '0.95rem', color: '#fff', lineHeight: 1.6, marginBottom: '1.25rem' }}>{prompt.body}</div>

      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '0.85rem', minHeight: 50, borderRadius: 12,
          background: done ? c : 'rgba(255,255,255,0.06)',
          border: `1px solid ${done ? c : 'rgba(255,255,255,0.12)'}`,
          color: done ? '#2D3850' : '#fff',
          fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer',
          marginBottom: '0.85rem',
        }}>
        {done ? '✓ 오늘 했어요' : '오늘 인증하기'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '-4px' }}>
          {members.slice(0, 5).map((m, i) => (
            <div key={m.profileId} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <Avatar name={m.displayName} size={24} ring={m.profileId === ownProfileId && done} />
            </div>
          ))}
        </div>
        <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)' }}>
          {doneCount}/{total} 명이 오늘 함께
        </span>
      </div>
    </div>
  );
};

// === Activity card (Threads style) ===
const ActivityCard = ({ item }: { item: ActivityItem }) => {
  const c = MODE_LABELS[item.mode].color;
  return (
    <div style={{ padding: '0.95rem 1rem', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.55rem' }}>
        <Avatar name={item.profileName} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{item.profileName}</span>
            <span style={{ fontSize: '0.66rem', padding: '0.1rem 0.45rem', borderRadius: 999, background: `${c}26`, color: c, fontWeight: 600 }}>
              {MODE_LABELS[item.mode].icon} {MODE_LABELS[item.mode].ko}
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.1rem' }}>
            {timeAgo(item.isoAt)} · {item.meta}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, marginBottom: '0.55rem' }}>
        {item.text}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button style={{ padding: '0.35rem 0.7rem', minHeight: 32, borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.78)', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>
          🙏 {item.prayerCount}
        </button>
      </div>
    </div>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const nickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const email = typeof context.query.email === 'string' ? context.query.email : null;
  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  return { props: { profileId, nickname, email, systemAdminHref } };
};
