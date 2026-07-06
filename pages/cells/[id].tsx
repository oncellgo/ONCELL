import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import TopNav from '../../components/TopNav';
import { useIsMobile } from '../../lib/useIsMobile';
import { getSystemAdminHref } from '../../lib/adminGuard';
import { getSessionProfileId } from '../../lib/session';

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

type Member = { profileId: string; displayName: string; joinedAt: string; isOwner: boolean };

type MemberToday = {
  profileId: string;
  displayName: string;
  isOwner: boolean;
  completed: boolean;
  shared: boolean;
  visibility: string | null;
  content: { reference: string | null; feelings: string; decision: string; prayer: string } | null;
  reactions: { like: number; amen: number; pray: number };
  myReactions: string[];
};
type TodayData = {
  date: string;
  members: MemberToday[];
  me: { hasNote: boolean; completed: boolean; shared: boolean; visibility: string | null };
  counts: { completed: number; total: number };
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
const SUPPORTED_MODES: ModeKey[] = ['qt'];

const REACTION_META: Array<{ key: 'like' | 'amen' | 'pray'; emoji: string; label: string }> = [
  { key: 'like', emoji: '❤️', label: '좋아요' },
  { key: 'amen', emoji: '🙏', label: '아멘' },
  { key: 'pray', emoji: '🤲', label: '기도' },
];

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
      color: '#fff', fontWeight: 700, fontSize: size * 0.42, flexShrink: 0,
      ...(ring ? { boxShadow: `0 0 0 2px rgba(165,243,252,0.7)`, outline: '2px solid #2D3850', outlineOffset: -4 } : {}),
    }}>
      {initial(name)}
    </div>
  );
};

// SG(UTC+8) 당일 — 서버 getSGTodayKey 와 동일 규칙
const todaySG = (): string => {
  const now = new Date();
  const sg = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sg.getFullYear()}-${pad(sg.getMonth() + 1)}-${pad(sg.getDate())}`;
};
const previewText = (s: string, max = 90): string => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

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

  const todayStr = useMemo(() => todaySG(), []);

  const [qt, setQt] = useState<{ reference: string | null; passageText: string | null; error?: string } | null>(null);
  const [qtLoading, setQtLoading] = useState(false);

  const [today, setToday] = useState<TodayData | null>(null);
  const [sharing, setSharing] = useState(false);
  const [visChoice, setVisChoice] = useState<'full' | 'feelings'>('full');

  // 셀 홈 인라인 큐티 — 본문 읽고 묵상 바로 작성
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showFullPassage, setShowFullPassage] = useState(false);
  const [qtEditorOpen, setQtEditorOpen] = useState(false); // 완료 후 본문·에디터 접기/펼치기

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

  useEffect(() => {
    if (!enabledModes.includes('qt')) return;
    setQtLoading(true);
    fetch('/api/qt')
      .then((r) => r.json())
      .then((d) => setQt({ reference: d.reference ?? null, passageText: d.passageText ?? null, error: d.error }))
      .catch(() => setQt({ reference: null, passageText: null, error: '본문을 불러오지 못했어요' }))
      .finally(() => setQtLoading(false));
  }, [enabledModes]);

  const loadToday = useCallback(async () => {
    if (!profileId || !cellId) return;
    try {
      const r = await fetch(`/api/cells/${encodeURIComponent(cellId)}/today?profileId=${encodeURIComponent(profileId)}&date=${todayStr}`);
      const d = await r.json();
      if (r.ok) setToday(d);
    } catch {}
  }, [profileId, cellId, todayStr]);
  useEffect(() => { loadToday(); }, [loadToday]);

  // 오늘 내 묵상 노트 로드 → 에디터에 채움
  useEffect(() => {
    if (!profileId || !enabledModes.includes('qt')) return;
    fetch(`/api/qt-notes?date=${todayStr}`)
      .then((r) => r.json())
      .then((d) => setNoteText(d?.note?.feelings || ''))
      .catch(() => {});
  }, [profileId, enabledModes, todayStr]);

  const saveNote = async () => {
    if (!profileId || savingNote) return;
    const text = noteText.trim();
    if (!text) { showToast('묵상을 입력해주세요'); return; }
    setSavingNote(true);
    try {
      const r = await fetch('/api/qt-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayStr, reference: qt?.reference || null, feelings: text }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); showToast(d.error || '저장 실패'); setSavingNote(false); return; }
      showToast('묵상 저장됨 ✓');
      await loadToday(); // hasNote/완료 갱신
      setQtEditorOpen(true); // 저장 직후엔 펼친 채로 두어 공개 링크가 바로 보이게
    } catch { showToast('저장 실패'); }
    finally { setSavingNote(false); }
  };

  // 현재 공개 상태에 맞춰 visibility 선택 초기화
  useEffect(() => { if (today?.me.visibility === 'feelings' || today?.me.visibility === 'full') setVisChoice(today.me.visibility); }, [today?.me.visibility]);

  const [activeMode, setActiveMode] = useState<ModeKey>('qt');
  useEffect(() => {
    if (enabledModes.length > 0 && !enabledModes.includes(activeMode)) setActiveMode(enabledModes[0]);
  }, [enabledModes, activeMode]);

  const inviteUrl = cell ? `${typeof window !== 'undefined' ? window.location.origin : 'https://oncell.org'}/join/${cell.invite_token}` : '';
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); showToast('초대 링크 복사됨'); } catch { showToast('복사 실패'); }
  };
  const shareInvite = async () => {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try { await (navigator as any).share({ title: `${cell?.name} 초대`, text: cell?.invite_message || `${cell?.name}에 초대합니다`, url: inviteUrl }); return; } catch {}
    }
    copyUrl();
  };

  // 이 셀에 공개 토글 (완료=노트 작성이 선행되어야 함)
  const toggleShare = async () => {
    if (!profileId || sharing || !cell) return;
    if (!today?.me.hasNote) { showToast('먼저 오늘 큐티를 작성해주세요'); router.push('/qt'); return; }
    const currentlyShared = !!today.me.shared;
    setSharing(true);
    try {
      if (currentlyShared) {
        const r = await fetch(`/api/cell-shares?profileId=${encodeURIComponent(profileId)}&cellId=${encodeURIComponent(cellId)}&mode=qt&date=${todayStr}`, { method: 'DELETE' });
        if (!r.ok) throw new Error();
        showToast('공개를 내렸어요');
      } else {
        const r = await fetch('/api/cell-shares', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, cellId, mode: 'qt', date: todayStr, visibility: visChoice }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { showToast(d.errorReason || '공개 실패'); setSharing(false); return; }
        showToast('이 셀에 공개했어요');
      }
      await loadToday();
    } catch {
      showToast('실패. 다시 시도해주세요');
    } finally {
      setSharing(false);
    }
  };

  const react = async (authorProfileId: string, reaction: 'like' | 'amen' | 'pray', active: boolean) => {
    if (!profileId || !cell) return;
    try {
      if (active) {
        await fetch(`/api/share-reactions?profileId=${encodeURIComponent(profileId)}&cellId=${encodeURIComponent(cellId)}&authorProfileId=${encodeURIComponent(authorProfileId)}&mode=qt&date=${todayStr}&reaction=${reaction}`, { method: 'DELETE' });
      } else {
        await fetch('/api/share-reactions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, cellId, authorProfileId, mode: 'qt', date: todayStr, reaction }),
        });
      }
      await loadToday();
    } catch {}
  };

  const completedMembers = (today?.members || []).filter((m) => m.completed);
  // 피드: 공유(내용)한 사람 먼저, 그다음 비공개 참여자
  const feed = [...completedMembers].sort((a, b) => (Number(b.shared) - Number(a.shared)) || a.displayName.localeCompare(b.displayName));
  const completedSet = new Set(completedMembers.map((m) => m.profileId));

  return (
    <>
      <Head><title>{cell?.name || '셀'} · ONCELL</title></Head>
      <div style={{ minHeight: '100vh' }}>
        <TopNav profileId={profileId} displayName={null} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        <main style={{ maxWidth: 620, margin: '0 auto', padding: isMobile ? '1.25rem 0.85rem 4rem' : '2.5rem 1.5rem 5rem', color: '#fff' }}>
          {loading && <div style={{ color: 'rgba(255,255,255,0.6)' }}>불러오는 중…</div>}
          {err && <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.32)', color: '#FCA5A5' }}>{err}</div>}

          {cell && (
            <>
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

                {/* 책갈피 탭 — 운영자가 켠 모드가 노트 인덱스 탭처럼. 활성 탭이 아래 카드와 연결됨. */}
                <div style={{ display: 'flex', gap: '0.3rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingLeft: '0.35rem', position: 'relative', zIndex: 2, marginBottom: -1 }}>
                  {enabledModes.map((m) => {
                    const active = activeMode === m;
                    const mc = MODE_LABELS[m].color;
                    const bar = active ? `${mc}40` : 'rgba(255,255,255,0.07)';
                    return (
                      <button key={m} onClick={() => setActiveMode(m)} style={{
                        flexShrink: 0, padding: '0.55rem 1.05rem 0.7rem', minHeight: 40,
                        borderRadius: '12px 12px 0 0',
                        background: active ? `${mc}10` : 'rgba(255,255,255,0.02)',
                        borderTop: `1px solid ${bar}`, borderLeft: `1px solid ${bar}`, borderRight: `1px solid ${bar}`, borderBottom: 'none',
                        color: active ? mc : 'rgba(255,255,255,0.5)',
                        fontSize: '0.84rem', fontWeight: active ? 800 : 600, cursor: 'pointer',
                        transform: active ? 'translateY(0)' : 'translateY(3px)',
                        boxShadow: active ? '0 -3px 8px rgba(0,0,0,0.12)' : 'none',
                        transition: 'transform 0.12s ease, background 0.12s ease',
                      }}>
                        {MODE_LABELS[m].icon} {MODE_LABELS[m].ko}
                      </button>
                    );
                  })}
                </div>

                <TodayCard
                  mode={activeMode}
                  supported={SUPPORTED_MODES.includes(activeMode)}
                  qt={qt}
                  qtLoading={qtLoading}
                  me={today?.me}
                  counts={today?.counts}
                  completedMembers={completedMembers}
                  ownProfileId={profileId}
                  sharing={sharing}
                  visChoice={visChoice}
                  setVisChoice={setVisChoice}
                  onShare={toggleShare}
                  noteText={noteText}
                  setNoteText={setNoteText}
                  onSaveNote={saveNote}
                  savingNote={savingNote}
                  showFullPassage={showFullPassage}
                  setShowFullPassage={setShowFullPassage}
                  editorOpen={!(today?.me.hasNote) || qtEditorOpen}
                  onToggleEditor={() => setQtEditorOpen((v) => !v)}
                />
              </section>

              {/* === 2. 오늘 함께한 셀 친구 (실제 피드) === */}
              {activeMode === 'qt' && (
                <section style={{ marginBottom: '1.75rem' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '0.6rem', letterSpacing: '0.02em' }}>오늘 함께한 셀 친구</div>
                  {feed.length === 0 ? (
                    <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)' }}>
                      아직 오늘 큐티한 셀 친구가 없어요. 첫 번째가 되어보세요.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                      {feed.map((m) => (
                        <FeedCard key={m.profileId} m={m} isMe={m.profileId === profileId} onReact={react} />
                      ))}
                    </div>
                  )}
                </section>
              )}

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
                      <span style={{ fontSize: '0.72rem', color: completedSet.has(m.profileId) ? '#A5F3FC' : 'rgba(255,255,255,0.45)' }}>
                        {completedSet.has(m.profileId) ? '✓ 오늘' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* === 4. 초대 === */}
              <section style={{ padding: '1rem', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem' }}>친구 초대</div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <div style={{ flex: 1, fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', padding: '0.5rem 0.65rem', borderRadius: 8, background: 'rgba(0,0,0,0.2)' }}>{inviteUrl}</div>
                  <button onClick={copyUrl} style={{ padding: '0.5rem 0.85rem', minHeight: 40, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>복사</button>
                  <button onClick={shareInvite} style={{ padding: '0.5rem 0.85rem', minHeight: 40, borderRadius: 8, background: '#A5F3FC', border: 'none', color: '#2D3850', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>공유</button>
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

// === 오늘의 활동 카드 ===
const TodayCard = ({ mode, supported, qt, qtLoading, me, counts, completedMembers, ownProfileId, sharing, visChoice, setVisChoice, onShare, noteText, setNoteText, onSaveNote, savingNote, showFullPassage, setShowFullPassage, editorOpen, onToggleEditor }: {
  mode: ModeKey;
  supported: boolean;
  qt: { reference: string | null; passageText: string | null; error?: string } | null;
  qtLoading: boolean;
  me: TodayData['me'] | undefined;
  counts: { completed: number; total: number } | undefined;
  completedMembers: MemberToday[];
  ownProfileId: string | null;
  sharing: boolean;
  visChoice: 'full' | 'feelings';
  setVisChoice: (v: 'full' | 'feelings') => void;
  onShare: () => void;
  noteText: string;
  setNoteText: (v: string) => void;
  onSaveNote: () => void;
  savingNote: boolean;
  showFullPassage: boolean;
  setShowFullPassage: (v: boolean) => void;
  editorOpen: boolean;
  onToggleEditor: () => void;
}) => {
  const c = MODE_LABELS[mode].color;

  if (mode !== 'qt') {
    return (
      <div style={{ padding: '1.25rem', borderRadius: 16, background: `${c}10`, border: `1px solid ${c}40` }}>
        <div style={{ fontSize: '0.78rem', color: c, fontWeight: 700, marginBottom: '0.4rem' }}>{MODE_LABELS[mode].ko}</div>
        <div style={{ padding: '0.7rem 0.9rem', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.18)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)' }}>
          {MODE_LABELS[mode].ko}은 다음 업데이트에서 제공됩니다.
        </div>
      </div>
    );
  }

  const ref = qt?.reference || (qtLoading ? '본문 불러오는 중…' : '오늘의 큐티');
  const passage = qt?.passageText || '';
  const total = counts?.total ?? 0;
  const doneCount = counts?.completed ?? 0;
  const done = !!me?.hasNote;

  return (
    <div style={{ padding: '1.25rem', borderRadius: 16, background: `${c}10`, border: `1px solid ${c}40` }}>
      {/* 완료했으면 접힌 완료 헤더 + 펼치기 토글 */}
      {done && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: editorOpen ? '0.7rem' : '0.85rem' }}>
          <span style={{ fontSize: '0.88rem', color: c, fontWeight: 800 }}>✓ 오늘 큐티 완료</span>
          <button onClick={onToggleEditor} style={{ background: 'none', border: 'none', color: c, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            {editorOpen ? '접기 ▲' : '본문·내 묵상 ▼'}
          </button>
        </div>
      )}

      {editorOpen && (<>
      <div style={{ fontSize: '0.78rem', color: c, fontWeight: 700, marginBottom: '0.5rem' }}>{ref}</div>

      {/* 본문 — 인라인 읽기 (펼치기) */}
      {passage ? (
        <div style={{ marginBottom: '0.85rem' }}>
          <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: showFullPassage ? 'none' : 96, overflow: 'hidden', position: 'relative' }}>
            {passage}
            {!showFullPassage && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 40, background: 'linear-gradient(rgba(45,56,80,0), rgba(45,56,80,0.95))' }} />}
          </div>
          <button onClick={() => setShowFullPassage(!showFullPassage)} style={{ background: 'none', border: 'none', color: c, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', padding: '0.3rem 0' }}>
            {showFullPassage ? '접기 ▲' : '본문 전체 보기 ▼'}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.85rem' }}>{qt?.error || (qtLoading ? '본문 불러오는 중…' : '오늘 본문을 준비 중입니다.')}</div>
      )}

      {/* 인라인 묵상 작성 */}
      <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>오늘의 묵상</div>
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="이 본문에서 받은 은혜를 적어보세요."
          rows={4}
          style={{ padding: '0.7rem 0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.2)', color: '#fff', fontSize: '0.9rem', lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
        />
        <button onClick={onSaveNote} disabled={savingNote} style={{ width: '100%', padding: '0.75rem', minHeight: 46, borderRadius: 12, border: 'none', background: savingNote ? 'rgba(255,255,255,0.2)' : c, color: '#2D3850', fontSize: '0.92rem', fontWeight: 800, cursor: savingNote ? 'wait' : 'pointer' }}>
          {savingNote ? '저장 중…' : done ? '묵상 수정 저장' : '묵상 저장 (오늘 완료)'}
        </button>
      </div>

      {/* 공개/내리기 — 내 글 보기(펼침) 안에서 작은 링크로 */}
      {done && (
        <div style={{ marginTop: '0.1rem', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {!me?.shared && (['full', 'feelings'] as const).map((v) => (
            <button key={v} onClick={() => setVisChoice(v)} style={{ padding: '0.22rem 0.55rem', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', background: visChoice === v ? `${c}26` : 'transparent', border: `1px solid ${visChoice === v ? `${c}66` : 'rgba(255,255,255,0.15)'}`, color: visChoice === v ? c : 'rgba(255,255,255,0.55)' }}>
              {v === 'full' ? '전문' : '느낀점'}
            </button>
          ))}
          <button onClick={onShare} disabled={sharing} style={{ background: 'none', border: 'none', color: me?.shared ? 'rgba(255,255,255,0.6)' : c, fontSize: '0.8rem', fontWeight: 700, cursor: sharing ? 'wait' : 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0 }}>
            {sharing ? '처리 중…' : me?.shared ? `이 셀에 공개됨 (${me.visibility === 'feelings' ? '느낀점' : '전문'}) · 내리기` : '이 셀에 공개하기'}
          </button>
        </div>
      )}
      </>)}

      {/* 참여 현황 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex' }}>
          {completedMembers.slice(0, 5).map((m, i) => (
            <div key={m.profileId} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <Avatar name={m.displayName} size={24} ring={m.profileId === ownProfileId} />
            </div>
          ))}
        </div>
        <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)' }}>{doneCount}/{total} 명이 오늘 함께</span>
      </div>
      <a href="/qt" style={{ display: 'inline-block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', marginTop: '0.6rem' }}>큐티 페이지에서 지난 묵상 보기 →</a>
    </div>
  );
};

// === 피드 카드 (완료자 · 공유자 내용 + 반응) ===
const FeedCard = ({ m, isMe, onReact }: { m: MemberToday; isMe: boolean; onReact: (author: string, r: 'like' | 'amen' | 'pray', active: boolean) => void }) => {
  const c = MODE_LABELS.qt.color;
  return (
    <div style={{ padding: '0.95rem 1rem', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: m.shared ? '0.55rem' : 0 }}>
        <Avatar name={m.displayName} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{isMe ? '나' : m.displayName}</span>
            {m.isOwner && <span style={{ fontSize: '0.62rem', padding: '0.06rem 0.35rem', borderRadius: 999, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>owner</span>}
            <span style={{ fontSize: '0.66rem', padding: '0.1rem 0.45rem', borderRadius: 999, background: `${c}26`, color: c, fontWeight: 600 }}>✓ 오늘 완료</span>
          </div>
          {m.shared && m.content?.reference && (
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.1rem' }}>{m.content.reference}</div>
          )}
        </div>
      </div>

      {!m.shared ? (
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.45)', paddingLeft: '2.6rem' }}>내용 비공개</div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.6rem' }}>
            {m.content?.feelings && <FeedField label="느낀 점" text={m.content.feelings} />}
            {m.content?.decision && <FeedField label="나의 결단" text={m.content.decision} />}
            {m.content?.prayer && <FeedField label="기도 제목" text={m.content.prayer} />}
            {!m.content?.feelings && !m.content?.decision && !m.content?.prayer && (
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>공개된 묵상 내용이 없습니다.</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {REACTION_META.map((r) => {
              const active = m.myReactions.includes(r.key);
              const count = m.reactions[r.key] || 0;
              return (
                <button
                  key={r.key}
                  onClick={() => !isMe && onReact(m.profileId, r.key, active)}
                  disabled={isMe}
                  title={isMe ? '내 묵상엔 반응할 수 없어요' : r.label}
                  style={{
                    padding: '0.35rem 0.7rem', minHeight: 32, borderRadius: 999,
                    background: active ? `${c}26` : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${active ? `${c}66` : 'rgba(255,255,255,0.1)'}`,
                    color: active ? c : 'rgba(255,255,255,0.78)',
                    fontSize: '0.76rem', fontWeight: 600, cursor: isMe ? 'default' : 'pointer', opacity: isMe ? 0.5 : 1,
                  }}
                >
                  {r.emoji} {count > 0 ? count : ''}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

const FeedField = ({ label, text }: { label: string; text: string }) => (
  <div style={{ display: 'grid', gap: '0.1rem' }}>
    <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
    <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.88)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{text}</p>
  </div>
);

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  // 신원은 세션 쿠키에서 (URL 쿼리 신뢰 제거). 표시용 nickname/email 은 클라이언트 useSession 이 채움.
  const profileId = getSessionProfileId(context.req);
  const systemAdminHref = await getSystemAdminHref(profileId, {});
  return { props: { profileId, nickname: null, email: null, systemAdminHref } };
};
