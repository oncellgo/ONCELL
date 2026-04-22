import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useAudio } from '../components/AudioPlayer';
import AppShell from '../components/AppShell';
import { WorshipBulletinPreview } from '../components/WorshipBulletinEditor';
import { getCommunities, getUsers, getProfiles } from '../lib/dataStore';
import { getSystemAdminHref } from '../lib/adminGuard';
import { useIsMobile } from '../lib/useIsMobile';
import { isAllDayEvent } from '../lib/events';

type Community = {
  id: string;
  name: string;
  adminProfileId?: string;
  joinApprovalMode?: 'auto' | 'admin';
  requireRealName?: boolean;
};

type UserEntry = {
  userId: string;
  provider: string;
  providerProfileId: string;
  communityId: string;
  communityName: string;
  nickname: string;
  realName: string;
  contact: string;
  membershipStatus?: 'active' | 'pending';
  registeredAt: string;
  profile: any;
};

type StoredProfile = {
  profileId: string;
  provider: string;
  nickname: string;
  realName: string;
  contact: string;
  email?: string;
} | null;

type DashboardProps = {
  profileId: string | null;
  provider: string | null;
  nickname: string | null;
  email: string | null;
  joinedCommunities: Array<Community & { isAdmin: boolean }>;
  userEntries: UserEntry[];
  storedProfile: StoredProfile;
  systemAdminHref: string | null;
};

const Dashboard = ({ profileId, provider, nickname, email, joinedCommunities, userEntries, storedProfile, systemAdminHref }: DashboardProps) => {
  const { t } = useTranslation();
  const audio = useAudio();
  const isMobile = useIsMobile();
  const [profileDone, setProfileDone] = useState<boolean>(!!storedProfile);
  const [realName, setRealName] = useState<string>(storedProfile?.realName || nickname || '');
  const [countryCode, setCountryCode] = useState<string>('+65');
  const [contact, setContact] = useState<string>(storedProfile?.contact?.replace(/^\+\d+-/, '') || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileExpanded, setProfileExpanded] = useState(false);
  const [communityDropdownOpen, setCommunityDropdownOpen] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [newCommunityApproval, setNewCommunityApproval] = useState<'auto' | 'admin'>('auto');
  const [newCommunityRequireRealName, setNewCommunityRequireRealName] = useState<boolean>(true);
  const [newCommunityTimezone, setNewCommunityTimezone] = useState<string>(() => {
    if (typeof window === 'undefined') return 'Asia/Seoul';
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; } catch { return 'Asia/Seoul'; }
  });
  const [qt, setQt] = useState<{
    reference: string | null;
    passage: string | null;
    hymn: { number: string; title: string | null } | null;
    audioUrl: string | null;
    source: string;
  } | null>(null);
  const [audioOpen, setAudioOpen] = useState(false);

  // QT 3단 노트 서버 상태
  type QtNote = { feelings: string; decision: string; prayer: string; updatedAt?: string };
  const [qtNoteToday, setQtNoteToday] = useState<QtNote | null>(null);
  const [qtNoteYesterday, setQtNoteYesterday] = useState<QtNote | null>(null);
  const [qtNoteDates, setQtNoteDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    fetch(`/api/qt-notes?profileId=${encodeURIComponent(profileId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const notes: Array<{ date: string; feelings?: string; decision?: string; prayer?: string; updatedAt?: string }> = Array.isArray(d?.notes) ? d.notes : [];
        const pad = (n: number) => String(n).padStart(2, '0');
        const toKey = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
        const today = toKey(new Date());
        const yesterdayDt = new Date(); yesterdayDt.setDate(yesterdayDt.getDate() - 1);
        const yesterday = toKey(yesterdayDt);
        const dates = new Set<string>();
        let t: QtNote | null = null; let y: QtNote | null = null;
        for (const n of notes) {
          const has = (n.feelings || n.decision || n.prayer || '').trim().length > 0;
          if (has) dates.add(n.date);
          if (n.date === today && has) t = { feelings: n.feelings || '', decision: n.decision || '', prayer: n.prayer || '', updatedAt: n.updatedAt };
          if (n.date === yesterday && has) y = { feelings: n.feelings || '', decision: n.decision || '', prayer: n.prayer || '' };
        }
        setQtNoteToday(t);
        setQtNoteYesterday(y);
        setQtNoteDates(dates);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profileId]);
  const [qtLoading, setQtLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/qt', { cache: 'force-cache' })
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setQt(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setQtLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  const createCommunity = async () => {
    if (!profileId) return;
    const name = newCommunityName.trim();
    if (!name) {
      setCreateMsg('공동체 이름을 입력해주세요.');
      return;
    }
    setCreatingCommunity(true);
    setCreateMsg(null);
    try {
      const response = await fetch('/api/communities/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          profileId,
          provider: provider || 'kakao',
          nickname: nickname || '',
          email: email || '',
          joinApprovalMode: newCommunityApproval,
          requireRealName: newCommunityRequireRealName,
          timezone: newCommunityTimezone,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCreateMsg(data.error || '생성에 실패했습니다.');
      } else {
        const params = new URLSearchParams();
        params.set('profileId', profileId);
        if (nickname) params.set('nickname', nickname);
        if (email) params.set('email', email);
        if (data.community?.id) params.set('communityId', data.community.id);
        router.replace(`/dashboard?${params.toString()}`);
      }
    } catch (error) {
      console.error(error);
      setCreateMsg('생성 중 오류가 발생했습니다.');
    } finally {
      setCreatingCommunity(false);
    }
  };

  const saveProfile = async () => {
    if (!profileId) return;
    if (!realName.trim() || !contact.trim()) {
      setProfileMsg('실명과 연락처를 입력해주세요.');
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          provider: provider || 'kakao',
          nickname: nickname || '',
          realName: realName.trim(),
          contact: `${countryCode}-${contact.trim()}`,
          email: email || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setProfileMsg(data.error || '저장에 실패했습니다.');
      } else {
        setProfileDone(true);
        setProfileMsg('프로필이 저장되었습니다.');
      }
    } catch (error) {
      console.error(error);
      setProfileMsg('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingProfile(false);
    }
  };

  const router = useRouter();
  // 한도 초과로 유입된 경우 (?focus=my-reservations) 또는 #my-reservations 앵커 → 해당 섹션 스크롤 + 깜빡 강조
  const [reservationsFlash, setReservationsFlash] = useState(false);
  useEffect(() => {
    if (!router.isReady) return;
    const wantsFocus = router.query.focus === 'my-reservations' || (typeof window !== 'undefined' && window.location.hash === '#my-reservations');
    if (!wantsFocus) return;
    const el = document.getElementById('my-reservations');
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setReservationsFlash(true);
        setTimeout(() => setReservationsFlash(false), 2400);
      }, 120);
    }
  }, [router.isReady, router.query.focus]);
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(null);
  const [publishedServices, setPublishedServices] = useState<any[]>([]);
  const [previewBulletin, setPreviewBulletin] = useState<any>(null);

  type WeekEvent = { id: string; title: string; startAt: string; endAt: string; location?: string; scope?: string; category?: string };
  type MyReservation = { id: string; title: string; startAt: string; endAt: string; location?: string };
  const [weekEvents, setWeekEvents] = useState<WeekEvent[] | null>(null);
  const [myReservations, setMyReservations] = useState<MyReservation[] | null>(null);
  // 이번달 목회일정 (미스바 PDF에서 추출)
  type MonthlyItem = { date: string; label: string; title: string };
  const [monthlySchedule, setMonthlySchedule] = useState<{ month: number; items: MonthlyItem[] } | null>(null);
  // 이번주(월~일) 큐티·통독 완료 dateKey 집합
  const [weekQtDates, setWeekQtDates] = useState<Set<string>>(new Set());
  const [weekReadingDates, setWeekReadingDates] = useState<Set<string>>(new Set());
  // 큐티 장기 기록 — 연속 일수(streak) + 총 일수 (최근 180일)
  const [qtHistoryDates, setQtHistoryDates] = useState<Set<string>>(new Set());
  const [weekExpanded, setWeekExpanded] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);  // 0=이번주, -1=지난주, +1=다음주

  // 선택된 주(weekOffset)의 일요일~토요일 범위
  const weekRange = (() => {
    const now = new Date();
    const day = now.getDay();  // 0=일
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day + weekOffset * 7);
    sunday.setHours(0, 0, 0, 0);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    saturday.setHours(23, 59, 59, 999);
    return { sunday, saturday };
  })();
  const padN = (n: number) => String(n).padStart(2, '0');
  const keyOf = (d: Date) => `${d.getFullYear()}-${padN(d.getMonth() + 1)}-${padN(d.getDate())}`;
  const weekFromStr = keyOf(weekRange.sunday);
  const weekToStr = keyOf(weekRange.saturday);
  const weekLabel = weekOffset === 0 ? '이번주' : weekOffset === -1 ? '지난주' : weekOffset === 1 ? '다음주' : weekOffset > 0 ? `+${weekOffset}주` : `${weekOffset}주`;
  const weekRangeText = `${weekRange.sunday.getMonth() + 1}/${weekRange.sunday.getDate()} ~ ${weekRange.saturday.getMonth() + 1}/${weekRange.saturday.getDate()}`;

  useEffect(() => {
    // 선택된 주(일~토) 교회일정 - kcis 공동체 기준
    const qs = new URLSearchParams({ communityId: 'kcis', type: 'event', from: weekFromStr, to: weekToStr });
    if (profileId) qs.set('profileId', profileId);
    setWeekEvents(null);
    fetch(`/api/events?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => setWeekEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => setWeekEvents([]));
  }, [profileId, weekFromStr, weekToStr]);

  useEffect(() => {
    if (!profileId) { setMyReservations([]); return; }
    const qs = new URLSearchParams({ communityId: 'kcis', type: 'reservation', profileId });
    fetch(`/api/events?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        const all = Array.isArray(d.events) ? d.events : [];
        const nowTs = Date.now();
        const future = all
          .filter((r: any) => new Date(r.endAt).getTime() >= nowTs)
          .sort((a: any, b: any) => a.startAt.localeCompare(b.startAt));
        setMyReservations(future);
      })
      .catch(() => setMyReservations([]));
  }, [profileId]);

  // 이번달 목회일정 fetch (미스바 PDF 캐싱 — Supabase KV)
  useEffect(() => {
    fetch('/api/monthly-schedule')
      .then((r) => r.json())
      .then((d) => { if (d && typeof d.month === 'number') setMonthlySchedule({ month: d.month, items: Array.isArray(d.items) ? d.items : [] }); })
      .catch(() => {});
  }, []);

  // 오늘 포함 최근 7일 큐티·통독 완료 + 큐티는 180일 히스토리도 같이 fetch (streak 계산용)
  useEffect(() => {
    if (!profileId) { setWeekQtDates(new Set()); setWeekReadingDates(new Set()); setQtHistoryDates(new Set()); return; }
    const now = new Date();
    const end = new Date(now); end.setHours(0, 0, 0, 0);
    const start7 = new Date(end); start7.setDate(end.getDate() - 6);
    const start180 = new Date(end); start180.setDate(end.getDate() - 179);
    const pad = (n: number) => String(n).padStart(2, '0');
    const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const to = keyOf(end);
    const from7 = keyOf(start7);
    const from180 = keyOf(start180);
    const load = async (type: 'qt' | 'reading', from: string, setter: (s: Set<string>) => void) => {
      try {
        const r = await fetch(`/api/completions?profileId=${encodeURIComponent(profileId)}&type=${type}&from=${from}&to=${to}`);
        if (!r.ok) return;
        const d = await r.json();
        setter(new Set(Array.isArray(d?.dates) ? d.dates : []));
      } catch {}
    };
    load('qt', from7, setWeekQtDates);
    load('reading', from7, setWeekReadingDates);
    load('qt', from180, setQtHistoryDates);
  }, [profileId]);

  // 큐티 연속 기록(streak) — 오늘(또는 어제, 오늘 아직 안 했을 때)부터 과거로 연속된 일수
  const qtStreak = useMemo(() => {
    if (qtHistoryDates.size === 0) return { current: 0, longest: 0 };
    const pad = (n: number) => String(n).padStart(2, '0');
    const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayKey = keyOf(today);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = keyOf(yesterday);

    // 현재 streak: 오늘부터 거슬러 올라가며 연속 합산 (오늘 안 했으면 어제부터 시작)
    let current = 0;
    const cursor = new Date(today);
    if (!qtHistoryDates.has(todayKey) && qtHistoryDates.has(yesterdayKey)) {
      cursor.setDate(cursor.getDate() - 1);  // 오늘 안 했지만 어제 했으면 어제부터 세기
    }
    while (qtHistoryDates.has(keyOf(cursor))) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // 최고 streak: 180일 내에서 연속된 구간 중 최장
    const sortedDates = Array.from(qtHistoryDates).sort();
    let longest = 0;
    let run = 0;
    let prev: string | null = null;
    for (const dk of sortedDates) {
      if (prev === null) { run = 1; }
      else {
        const pd = new Date(prev); pd.setDate(pd.getDate() + 1);
        const expected = keyOf(pd);
        run = expected === dk ? run + 1 : 1;
      }
      if (run > longest) longest = run;
      prev = dk;
    }
    return { current, longest };
  }, [qtHistoryDates]);

  useEffect(() => {
    if (!activeCommunityId) { setPublishedServices([]); return; }
    (async () => {
      try {
        const res = await fetch(`/api/communities/${encodeURIComponent(activeCommunityId)}/worship-services`);
        if (!res.ok) { setPublishedServices([]); return; }
        const d = await res.json();
        const all: any[] = Array.isArray(d.services) ? d.services : [];
        const pub = all.filter((s) => s.published && (s.bulletin || s.resolvedBulletin));
        pub.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
        setPublishedServices(pub);
      } catch { setPublishedServices([]); }
    })();
  }, [activeCommunityId]);

  const bulletinBgThumb = (s: any): string | null => {
    const b = s?.bulletin ?? s?.resolvedBulletin;
    const bg = b?.design?.background ?? b?.background;
    if (!bg) return null;
    if (bg.type === 'default') return bg.value === 'default2' ? '/images/bg2.png' : '/images/bg1.png';
    if (bg.type === 'upload' && bg.dataUrl) return bg.dataUrl;
    return null;
  };
  const todayLabel = new Date().toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  useEffect(() => {
    const queryCommunityId = typeof router.query.communityId === 'string' ? router.query.communityId : null;
    if (!queryCommunityId) {
      if (activeCommunityId) setActiveCommunityId(null);
      return;
    }
    if (
      queryCommunityId !== activeCommunityId &&
      joinedCommunities.some((community) => community.id === queryCommunityId)
    ) {
      setActiveCommunityId(queryCommunityId);
    }
    const target = joinedCommunities.find((c) => c.id === queryCommunityId);
    const wantAdminFlag = target?.isAdmin ? '1' : undefined;
    const currentAdminFlag = typeof router.query.isAdmin === 'string' ? router.query.isAdmin : undefined;
    if (wantAdminFlag !== currentAdminFlag) {
      const nextQuery: Record<string, string> = {};
      Object.entries(router.query).forEach(([k, v]) => { if (typeof v === 'string') nextQuery[k] = v; });
      if (wantAdminFlag) nextQuery.isAdmin = '1'; else delete nextQuery.isAdmin;
      router.replace({ pathname: '/dashboard', query: nextQuery }, undefined, { shallow: true });
    }
  }, [joinedCommunities, activeCommunityId, router.query.communityId, router.query.isAdmin]);

  const activeCommunity = joinedCommunities.find((community) => community.id === activeCommunityId)
  const selectCommunity = (communityId: string) => {
    setActiveCommunityId(communityId);
    const target = joinedCommunities.find((c) => c.id === communityId);
    router.replace(
      {
        pathname: '/dashboard',
        query: {
          ...(profileId ? { profileId } : {}),
          communityId,
          ...(target?.isAdmin ? { isAdmin: '1' } : {}),
        },
      },
      undefined,
      { shallow: true },
    );
  };

  const cardBase: React.CSSProperties = {
    padding: isMobile ? '1rem 1rem' : '1.5rem',
    borderRadius: 16,
    background: '#ffffff',
    boxShadow: '0 12px 32px rgba(24, 37, 39, 0.06)',
    border: '1px solid #E7F3EE',
  };
  const sectionTitle: React.CSSProperties = { margin: 0, fontSize: isMobile ? '1.05rem' : '1.35rem', color: '#182527', fontWeight: 800, letterSpacing: '-0.01em' };
  const helperText: React.CSSProperties = { margin: 0, color: '#2D4048', lineHeight: 1.6 };

  return (
    <>
      <Head>
        <title>{activeCommunity ? `${activeCommunity.name} · ${t('dashboard.title')}` : t('dashboard.title')}</title>
      </Head>

      <AppShell
        profileId={profileId}
        displayName={storedProfile?.realName || userEntries[0]?.realName || userEntries[0]?.nickname || nickname || null}
        nickname={nickname}
        email={email}
        isAdmin={joinedCommunities.some((c) => c.isAdmin)}
        systemAdminHref={systemAdminHref || undefined}
        brandExtras={activeCommunity && router.query.communityId && joinedCommunities.length > 0 ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setCommunityDropdownOpen((v) => !v)}
              aria-expanded={communityDropdownOpen}
              aria-label="공동체 전환"
              title="현재 선택된 공동체 · 클릭해서 전환"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.95rem',
                borderRadius: 999,
                border: 'none',
                background: '#CCF4E5',
                color: '#3F6212',
                fontWeight: 800,
                fontSize: '1.02rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(132, 204, 22, 0.25)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? 140 : 220 }}>{activeCommunity.name}</span>
              <span style={{ padding: '0.1rem 0.5rem', borderRadius: 999, background: '#ffffff', color: 'var(--color-ink)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.02em', border: '1px solid var(--color-gray)' }}>
                {activeCommunity.isAdmin ? '관리자' : '일반회원'}
              </span>
              <span style={{ transform: communityDropdownOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease', fontSize: '1.1rem', lineHeight: 1 }}>▾</span>
            </button>
            {communityDropdownOpen && (
              <>
                <div onClick={() => setCommunityDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                <ul style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  minWidth: 220,
                  zIndex: 40,
                  margin: 0,
                  padding: '0.35rem',
                  listStyle: 'none',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-gray)',
                  borderRadius: 12,
                  boxShadow: 'var(--shadow-card)',
                  maxHeight: 320,
                  overflowY: 'auto',
                }}>
                  {joinedCommunities.map((community) => {
                    const isActive = activeCommunityId === community.id;
                    return (
                      <li key={community.id}>
                        <button
                          type="button"
                          onClick={() => { selectCommunity(community.id); setCommunityDropdownOpen(false); }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            padding: '0.55rem 0.7rem',
                            borderRadius: 8,
                            border: 'none',
                            background: isActive ? 'var(--color-primary-tint)' : 'transparent',
                            color: 'var(--color-ink)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                            {community.name}
                          </span>
                          {community.isAdmin && (
                            <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, background: 'var(--color-ink)', color: '#ffffff', fontSize: '0.66rem', fontWeight: 700, flexShrink: 0 }}>관리자</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            </div>
          </div>
        ) : undefined}
      >
          {activeCommunity && (
          <section id="qt" style={{ display: 'grid', gap: '0.65rem', padding: '1.1rem 1.25rem', borderRadius: 16, background: 'linear-gradient(135deg, var(--color-ink) 0%, var(--color-ink-2) 100%)', color: '#ffffff', position: 'relative', overflow: 'hidden', boxShadow: 'var(--shadow-card-lg)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 90% 10%, rgba(32, 205, 141, 0.35), transparent 55%)', pointerEvents: 'none' }} />

            {/* 헤더: 타이틀 + 날짜 + 오디오듣기 + 전체보기 */}
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#ffffff', fontWeight: 800, letterSpacing: '-0.01em' }}>오늘의 큐티</h2>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0.18rem 0.55rem', borderRadius: 999, background: 'rgba(32, 205, 141, 0.22)', color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.75rem', border: '1px solid rgba(32, 205, 141, 0.3)' }}>
                  {todayLabel}
                </span>
                {!qtLoading && qt?.audioUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      if (audio.isOpen && audio.src === qt.audioUrl) audio.close();
                      else audio.play(qt.audioUrl!, '오늘의 큐티');
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.7rem', borderRadius: 999, background: 'var(--color-primary)', color: '#ffffff', fontWeight: 700, fontSize: '0.75rem', border: 'none', cursor: 'pointer' }}
                  >
                    {audio.isOpen && audio.src === qt.audioUrl ? '■ 닫기' : '▶ 오디오 듣기'}
                  </button>
                )}
              </div>
              {!qtLoading && (() => {
                const params = new URLSearchParams();
                if (profileId) params.set('profileId', profileId);
                if (nickname) params.set('nickname', nickname);
                if (email) params.set('email', email);
                return (
                  <a
                    href={`/qt/notes?${params.toString()}`}
                    style={{ color: 'rgba(255, 255, 255, 0.78)', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none' }}
                  >
                    전체 보기 →
                  </a>
                );
              })()}
            </div>

            {/* 본문 + 찬송가 한 줄 */}
            <div style={{ position: 'relative', display: 'grid', gap: '0.4rem' }}>
              {qtLoading ? (
                <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.72)', fontSize: '0.88rem' }}>오늘의 말씀을 불러오는 중…</p>
              ) : qt?.reference || qt?.passage || qt?.hymn ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {qt?.reference && (
                      <strong style={{ fontSize: '1rem', color: '#ffffff' }}>
                        본문 · <span style={{ color: 'var(--color-primary)' }}>{qt.reference}</span>
                      </strong>
                    )}
                    {qt?.hymn && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: 999, background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', fontWeight: 700, fontSize: '0.76rem', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                        ♪ 찬송가 {qt.hymn.number}장{qt.hymn.title ? ` · ${qt.hymn.title}` : ''}
                      </span>
                    )}
                  </div>
                  {qt?.passage && (
                    <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.55, fontSize: '0.88rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {qt.passage}
                    </p>
                  )}

                  {/* 묵상노트 통합 — 작성/어제 미리보기/30일 히트맵 */}
                  <div style={{ marginTop: '0.25rem', display: 'grid', gap: '0.55rem' }}>
                    {(() => {
                      const params = new URLSearchParams();
                      if (profileId) params.set('profileId', profileId);
                      if (nickname) params.set('nickname', nickname);
                      if (email) params.set('email', email);
                      const hasToday = !!qtNoteToday;
                      return (
                        <a
                          href={`/qt/notes${params.toString() ? `?${params.toString()}` : ''}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: isMobile ? '0.55rem 0.9rem' : '0.3rem 0.7rem',
                            minHeight: isMobile ? 40 : undefined,
                            borderRadius: 999,
                            background: hasToday ? 'rgba(32, 205, 141, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                            color: hasToday ? 'var(--color-primary)' : '#ffffff',
                            border: hasToday ? '1px solid rgba(32, 205, 141, 0.35)' : '1px solid rgba(255, 255, 255, 0.22)',
                            fontWeight: 700,
                            fontSize: isMobile ? '0.85rem' : '0.78rem',
                            textDecoration: 'none',
                            width: 'fit-content',
                          }}
                        >
                          ✎ 묵상노트 열기{hasToday ? ' · 오늘 작성됨' : ''}
                        </a>
                      );
                    })()}

                    {qtNoteYesterday && (() => {
                      const one = (qtNoteYesterday.decision || qtNoteYesterday.feelings || qtNoteYesterday.prayer || '').replace(/\n+/g, ' ').slice(0, 60);
                      const label = qtNoteYesterday.decision ? '어제의 결단' : qtNoteYesterday.feelings ? '어제의 느낀점' : '어제의 기도제목';
                      return (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.78)', lineHeight: 1.5 }}>
                          <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>{label}: </span>
                          {one}{one.length >= 60 ? '…' : ''}
                        </p>
                      );
                    })()}

                    {profileId && (() => {
                      // 최근 30일 히트맵 (오늘 포함 오른쪽 정렬, 왼쪽이 과거)
                      const days: Array<{ key: string; hasNote: boolean; isToday: boolean }> = [];
                      const pad = (n: number) => String(n).padStart(2, '0');
                      const today = new Date();
                      const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
                      for (let i = 29; i >= 0; i--) {
                        const d = new Date(today);
                        d.setDate(today.getDate() - i);
                        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                        days.push({ key, hasNote: qtNoteDates.has(key), isToday: key === todayKey });
                      }
                      const count = days.filter((d) => d.hasNote).length;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                          <span style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            최근 30일 · {count}일 기록
                          </span>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(30, 1fr)', gap: isMobile ? 3 : 2, flex: 1, minWidth: isMobile ? '100%' : 160, maxWidth: 360 }}>
                            {days.map((d) => (
                              <span
                                key={d.key}
                                title={`${d.key}${d.hasNote ? ' · 기록됨' : ''}${d.isToday ? ' (오늘)' : ''}`}
                                style={{
                                  height: isMobile ? 12 : 10,
                                  borderRadius: 2,
                                  background: d.hasNote ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.12)',
                                  outline: d.isToday ? '1px solid rgba(255, 255, 255, 0.6)' : 'none',
                                  outlineOffset: 1,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.72)', fontSize: '0.88rem' }}>오늘의 해설 내용을 불러오지 못했습니다.</p>
              )}
            </div>
          </section>
          )}

          {joinedCommunities.length > 0 && !router.query.communityId && (
            <section id="community" style={{ ...cardBase, padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>
                  {t('dashboard.myCommunities')} <span style={{ color: 'var(--color-ink-2)', fontWeight: 700 }}>({joinedCommunities.length}{t('dashboard.countSuffix')})</span>
                </h2>
              </div>

              <div style={{
                marginTop: '0.75rem',
                display: 'grid',
                gap: '0.75rem',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              }}>
                {joinedCommunities.map((community) => {
                  const membershipEntry = userEntries.find((entry) => entry.communityId === community.id);
                  const membershipLabel = membershipEntry?.membershipStatus === 'pending' ? '가입대기' : '일반';
                  const isActive = activeCommunityId === community.id;
                  return (
                    <button
                      key={community.id}
                      type="button"
                      onClick={() => selectCommunity(community.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '0.55rem',
                        padding: '0.95rem 1rem',
                        borderRadius: 12,
                        border: isActive ? '1px solid var(--color-primary)' : '1px solid #E7F3EE',
                        background: isActive ? 'var(--color-primary-tint)' : '#CCF4E5',
                        color: 'var(--color-ink)',
                        boxShadow: isActive ? 'var(--shadow-card)' : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontWeight: 800, fontSize: '0.98rem', lineHeight: 1.3, wordBreak: 'break-word' }}>
                        {community.name}
                      </span>
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {community.isAdmin && (
                          <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, background: 'var(--color-ink)', color: '#ffffff', fontSize: '0.68rem', fontWeight: 700 }}>관리자</span>
                        )}
                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, background: isActive ? '#ffffff' : 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontSize: '0.68rem', fontWeight: 700 }}>
                          {membershipLabel}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}


          <section
            id="my-reservations"
            style={{
              ...cardBase,
              outline: reservationsFlash ? '3px solid #F97316' : 'none',
              outlineOffset: reservationsFlash ? '-1px' : undefined,
              boxShadow: reservationsFlash ? '0 0 0 4px rgba(249,115,22,0.18)' : cardBase.boxShadow,
              transition: 'outline 0.25s ease, box-shadow 0.25s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>📍 다가오는 나의 장소예약</h2>
              <a href="/reservations/grid" style={{ color: 'var(--color-primary-deep)', fontSize: isMobile ? '0.85rem' : '0.82rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 0.25rem' }}>새 예약 →</a>
            </div>
            {!profileId ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>로그인 후 이용해 주세요.</p>
            ) : myReservations === null ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>불러오는 중…</p>
            ) : myReservations.length === 0 ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>다가오는 예약이 없습니다. <a href="/reservations/grid" style={{ color: 'var(--color-primary-deep)', textDecoration: 'underline', fontWeight: 700 }}>장소 예약하기 →</a></p>
            ) : (
              <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'grid', gap: isMobile ? '0.55rem' : '0.45rem' }}>
                {myReservations.slice(0, 5).map((r) => {
                  const s = new Date(r.startAt);
                  const e = new Date(r.endAt);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const labels = ['일', '월', '화', '수', '목', '금', '토'];
                  const dateStr = `${pad(s.getMonth() + 1)}/${pad(s.getDate())} (${labels[s.getDay()]})`;
                  const timeStr = `${pad(s.getHours())}:${pad(s.getMinutes())}~${pad(e.getHours())}:${pad(e.getMinutes())}`;
                  return (
                    <li key={r.id} style={{ padding: isMobile ? '0.65rem 0.85rem' : '0.55rem 0.75rem', borderRadius: 10, background: '#ECFCCB', border: '1px solid #D9F09E', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '0.2rem' : '0.5rem', alignItems: isMobile ? 'flex-start' : 'baseline', flexWrap: 'wrap', fontSize: '0.88rem', minHeight: isMobile ? 44 : undefined }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{ color: '#3F6212', fontWeight: 800 }}>{dateStr}</span>
                        <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{timeStr}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--color-ink)', fontWeight: isMobile ? 700 : 400 }}>{r.title}</span>
                        {r.location && <span style={{ color: 'var(--color-ink-2)', fontSize: '0.82rem' }}>📍 {r.location}</span>}
                      </div>
                    </li>
                  );
                })}
                {myReservations.length > 5 && (
                  <li style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', textAlign: 'center', padding: '0.3rem 0' }}>
                    <a href={`/reservations/my${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''}`} style={{ color: 'var(--color-primary-deep)', textDecoration: 'underline', fontWeight: 700 }}>전체 {myReservations.length}건 보기 →</a>
                  </li>
                )}
              </ul>
            )}
          </section>

          {/* 큐티 연속 기록 — 매일 묵상 꾸준함을 격려하는 streak 트로피 */}
          {profileId && (() => {
            const cur = qtStreak.current;
            const best = qtStreak.longest;
            // 레벨: 0일 / 1일 / 3일 / 7일 / 14일 / 30일 / 50일 / 100일
            const lv = cur >= 100 ? 7 : cur >= 50 ? 6 : cur >= 30 ? 5 : cur >= 14 ? 4 : cur >= 7 ? 3 : cur >= 3 ? 2 : cur >= 1 ? 1 : 0;
            const tiers = [
              { emoji: '🌱', title: '오늘 묵상을 시작해볼까요?', sub: '하루 한 구절, 짧아도 괜찮아요.', ring: '#E5E7EB', bg: '#F9FAFB', fg: '#6B7280' },
              { emoji: '🌿', title: `${cur}일 연속 묵상 중`, sub: '첫걸음을 내딛었어요. 내일도 이어가볼까요?', ring: '#BBF7D0', bg: '#F0FDF4', fg: '#15803D' },
              { emoji: '✨', title: `${cur}일 연속 — 습관이 시작됐어요`, sub: '작은 반복이 큰 변화를 만듭니다.', ring: '#D9F09E', bg: '#F7FEE7', fg: '#3F6212' },
              { emoji: '🔥', title: `${cur}일 연속 — 일주일 달성!`, sub: '영적 리듬이 자리잡고 있어요.', ring: '#FCD34D', bg: '#FEF3C7', fg: '#92400E' },
              { emoji: '🏆', title: `${cur}일 연속 — 2주 돌파!`, sub: '꾸준함이 빛납니다. 계속 나아가요.', ring: '#FBBF24', bg: '#FEF3C7', fg: '#78350F' },
              { emoji: '👑', title: `${cur}일 연속 — 한 달의 기록`, sub: '놀라운 꾸준함이에요. 축복합니다 🙌', ring: '#F59E0B', bg: '#FEF3C7', fg: '#78350F' },
              { emoji: '💎', title: `${cur}일 연속 — 반백 일!`, sub: '이 기록이 교회의 자랑입니다.', ring: '#60A5FA', bg: '#DBEAFE', fg: '#1E3A8A' },
              { emoji: '🕊️', title: `${cur}일 연속 — 100일의 은혜`, sub: '하나님이 주신 귀한 기록입니다.', ring: '#A78BFA', bg: '#EDE9FE', fg: '#5B21B6' },
            ];
            const t = tiers[lv];
            // 오늘 묵상 했는지 여부 (오늘 아직인데 어제 이어짐은 current>0 + today 체크)
            const padN2 = (n: number) => String(n).padStart(2, '0');
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const tk = `${today.getFullYear()}-${padN2(today.getMonth() + 1)}-${padN2(today.getDate())}`;
            const doneToday = qtHistoryDates.has(tk);
            const qtHref = `/qt${profileId ? `?profileId=${encodeURIComponent(profileId)}${nickname ? `&nickname=${encodeURIComponent(nickname)}` : ''}${email ? `&email=${encodeURIComponent(email)}` : ''}` : ''}`;
            return (
              <section style={cardBase}>
                <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                  <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>📖 큐티 연속 기록</h2>
                  <span style={{ fontSize: isMobile ? '0.8rem' : '0.78rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>
                    현재 <strong style={{ color: 'var(--color-primary-deep)' }}>{cur}일</strong>
                    {best > cur && <> · 최고 {best}일</>}
                  </span>
                </div>
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: 14, background: t.bg, border: `1px solid ${t.ring}` }}>
                  <span aria-hidden style={{ fontSize: '2.4rem', lineHeight: 1 }}>{t.emoji}</span>
                  <div style={{ display: 'grid', gap: '0.2rem', flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '1rem', color: t.fg, fontWeight: 800, lineHeight: 1.25 }}>{t.title}</strong>
                    <span style={{ fontSize: '0.82rem', color: t.fg, opacity: 0.9, fontWeight: 600, lineHeight: 1.45 }}>{t.sub}</span>
                  </div>
                </div>
                {!doneToday && (
                  <a
                    href={qtHref}
                    style={{
                      marginTop: '0.6rem',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0.65rem 1rem', minHeight: 44,
                      borderRadius: 10,
                      background: cur > 0 ? 'var(--color-primary)' : '#fff',
                      color: cur > 0 ? '#fff' : 'var(--color-primary-deep)',
                      border: `1.5px solid var(--color-primary)`,
                      fontWeight: 800, fontSize: '0.92rem',
                      textDecoration: 'none',
                      width: isMobile ? '100%' : 'auto',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {cur > 0 ? `✍️ 오늘 묵상 이어가기 (${cur}일 → ${cur + 1}일)` : '✍️ 오늘 묵상 시작하기'}
                  </a>
                )}
                {doneToday && (
                  <div style={{ marginTop: '0.6rem', fontSize: '0.85rem', color: '#15803D', fontWeight: 700 }}>
                    ✓ 오늘 묵상 완료 — 내일도 이어가요!
                  </div>
                )}
              </section>
            );
          })()}

          {/* 이번주 영적 참여 — 큐티·통독 완료 수 기반 뱃지 + 응원 메세지 */}
          {profileId && (() => {
            const qt = weekQtDates.size;
            const rd = weekReadingDates.size;
            const total = Math.min(qt, 7) + Math.min(rd, 7);  // 최대 14
            const level = total >= 14 ? 5 : total >= 12 ? 4 : total >= 8 ? 3 : total >= 4 ? 2 : total >= 1 ? 1 : 0;
            const badges = [
              { emoji: '🌱', title: '이번주 함께 시작해볼까요?', sub: '작은 한 걸음부터 시작이에요.', ring: '#E5E7EB', bg: '#F9FAFB', fg: '#6B7280' },
              { emoji: '🌿', title: '시작이 좋아요!', sub: '오늘 한 걸음 더 내딛어봐요.', ring: '#BBF7D0', bg: '#F0FDF4', fg: '#15803D' },
              { emoji: '✨', title: '꾸준함이 멋져요', sub: '이번주 마무리까지 화이팅!', ring: '#D9F09E', bg: '#F7FEE7', fg: '#3F6212' },
              { emoji: '🔥', title: '대단합니다!', sub: '영적 근력이 자라고 있어요.', ring: '#FCD34D', bg: '#FEF3C7', fg: '#92400E' },
              { emoji: '🏆', title: '정말 훌륭해요!', sub: '하루만 더하면 완벽한 주간이에요.', ring: '#FBBF24', bg: '#FEF3C7', fg: '#78350F' },
              { emoji: '👑', title: '완벽한 한 주!', sub: '은혜가 가득한 기록이네요. 축복합니다 🙌', ring: '#F59E0B', bg: '#FEF3C7', fg: '#78350F' },
            ];
            const b = badges[level];
            const pct = Math.round((total / 14) * 100);
            return (
              <section style={cardBase}>
                <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '0.4rem', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
                  <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>🏆 최근 7일 큐티/성경통독</h2>
                  <span style={{ fontSize: isMobile ? '0.8rem' : '0.78rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>
                    {(() => {
                      const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
                      const now = new Date();
                      const end = new Date(now);
                      const start = new Date(end); start.setDate(end.getDate() - 6);
                      return `${start.getMonth() + 1}/${start.getDate()}(${DOWS[start.getDay()]}) ~ ${end.getMonth() + 1}/${end.getDate()}(${DOWS[end.getDay()]})`;
                    })()} · 총 {total}/14
                  </span>
                </div>
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: 14, background: b.bg, border: `1px solid ${b.ring}` }}>
                  <span aria-hidden style={{ fontSize: '2.2rem', lineHeight: 1 }}>{b.emoji}</span>
                  <div style={{ display: 'grid', gap: '0.15rem', flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '1rem', color: b.fg, fontWeight: 800 }}>{b.title}</strong>
                    <span style={{ fontSize: '0.82rem', color: b.fg, opacity: 0.85, fontWeight: 600 }}>{b.sub}</span>
                  </div>
                </div>
                {/* 진척 bar */}
                <div style={{ marginTop: '0.75rem', height: 8, borderRadius: 999, background: '#E5E7EB', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #20CD8D 0%, #65A30D 100%)', transition: 'width 0.3s ease' }} />
                </div>
                {/* QT·통독 카운트 — 클릭 시 각 메뉴로 이동 */}
                {(() => {
                  const params = new URLSearchParams();
                  if (profileId) params.set('profileId', profileId);
                  if (nickname) params.set('nickname', nickname);
                  if (email) params.set('email', email);
                  const qs = params.toString();
                  const suffix = qs ? `?${qs}` : '';
                  const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
                  const padZ = (n: number) => String(n).padStart(2, '0');
                  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
                  // 오늘 포함 최근 7일 (가장 오래된 날짜 → 오늘)
                  const days = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(today0);
                    d.setDate(today0.getDate() - (6 - i));
                    return { date: d, key: `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`, isToday: i === 6 };
                  });
                  const renderDayPills = (completedSet: Set<string>, accent: { base: string; bg: string; fg: string; border: string }) => (
                    <div style={{ display: 'flex', gap: isMobile ? '0.35rem' : '0.3rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                      {days.map((d) => {
                        const done = completedSet.has(d.key);
                        const dow = d.date.getDay();
                        const label = d.isToday ? `${DOWS[dow]}(오늘)` : DOWS[dow];
                        // 요일별 색상 팔레트: 일요일=빨강, 토요일=파랑, 평일=해당 메뉴 accent
                        const dowBase = dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : null;
                        // 평일(월~금): 진회색 테두리로 구분, 일/토: 각 요일 색
                        const borderColor = dowBase ? dowBase : (done ? accent.base : '#6B7280');
                        const borderWidth = '1.5px';
                        const background = done ? (dowBase || accent.base) : '#F9FAFB';
                        const textColor = done ? '#fff' : (dowBase || accent.fg);
                        return (
                          <span
                            key={d.key}
                            title={`${d.key}${done ? ' · 완료' : ''}`}
                            style={{
                              flex: '0 0 auto',
                              minWidth: isMobile ? (d.isToday ? 58 : 38) : (d.isToday ? 52 : 28),
                              minHeight: isMobile ? 40 : 28,
                              padding: isMobile ? '0.45rem 0.5rem' : '0.25rem 0.4rem',
                              borderRadius: 8,
                              background,
                              color: textColor,
                              border: `${borderWidth} solid ${borderColor}`,
                              fontSize: isMobile ? '0.8rem' : '0.72rem',
                              fontWeight: done ? 800 : 600,
                              textAlign: 'center',
                              lineHeight: 1.2,
                              opacity: done ? 1 : 0.85,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  );
                  return (
                    <div style={{ marginTop: '0.65rem', display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                      <a
                        href={`/qt${suffix}`}
                        title="큐티 메뉴로 이동"
                        style={{ padding: isMobile ? '0.75rem 0.85rem' : '0.6rem 0.75rem', borderRadius: 10, background: '#F7FEE7', border: '1px solid #D9F09E', display: 'grid', gap: isMobile ? '0.5rem' : '0.35rem', textDecoration: 'none', cursor: 'pointer', transition: 'box-shadow 0.15s ease' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 8px rgba(101, 163, 13, 0.2)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span aria-hidden>📖</span>
                          <span style={{ fontSize: isMobile ? '0.9rem' : '0.82rem', color: '#3F6212', fontWeight: 700 }}>큐티</span>
                          <strong style={{ marginLeft: 'auto', fontSize: isMobile ? '0.95rem' : '0.88rem', color: '#3F6212', fontWeight: 800 }}>{qt}<span style={{ fontSize: '0.76rem', fontWeight: 700, opacity: 0.6 }}>/7</span></strong>
                          <span aria-hidden style={{ color: '#3F6212', opacity: 0.6, fontSize: '0.82rem' }}>›</span>
                        </div>
                        {renderDayPills(weekQtDates, { base: '#65A30D', bg: '#F7FEE7', fg: '#3F6212', border: '#D9F09E' })}
                      </a>
                      <a
                        href={`/reading${suffix}`}
                        title="성경통독 메뉴로 이동"
                        style={{ padding: isMobile ? '0.75rem 0.85rem' : '0.6rem 0.75rem', borderRadius: 10, background: '#F7FEE7', border: '1px solid #D9F09E', display: 'grid', gap: isMobile ? '0.5rem' : '0.35rem', textDecoration: 'none', cursor: 'pointer', transition: 'box-shadow 0.15s ease' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 8px rgba(101, 163, 13, 0.2)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span aria-hidden>✝</span>
                          <span style={{ fontSize: isMobile ? '0.9rem' : '0.82rem', color: '#3F6212', fontWeight: 700 }}>성경통독</span>
                          <strong style={{ marginLeft: 'auto', fontSize: isMobile ? '0.95rem' : '0.88rem', color: '#3F6212', fontWeight: 800 }}>{rd}<span style={{ fontSize: '0.76rem', fontWeight: 700, opacity: 0.6 }}>/7</span></strong>
                          <span aria-hidden style={{ color: '#3F6212', opacity: 0.6, fontSize: '0.82rem' }}>›</span>
                        </div>
                        {renderDayPills(weekReadingDates, { base: '#65A30D', bg: '#F7FEE7', fg: '#3F6212', border: '#D9F09E' })}
                      </a>
                    </div>
                  );
                })()}
              </section>
            );
          })()}

          <section style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ ...sectionTitle, fontSize: '1.05rem', margin: 0 }}>📅 {monthlySchedule?.month || (new Date().getMonth() + 1)}월 교회일정</h2>
            </div>
            {!monthlySchedule ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>목회일정 불러오는 중…</p>
            ) : monthlySchedule.items.length === 0 ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>이번달 목회일정 정보가 아직 준비되지 않았습니다.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'grid', gap: isMobile ? '0.5rem' : '0.4rem' }}>
                {monthlySchedule.items.map((ev, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: isMobile ? '0.6rem 0.85rem' : '0.45rem 0.7rem', minHeight: isMobile ? 44 : undefined, borderRadius: 10, background: '#F9FCFB', border: '1px solid var(--color-surface-border)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: '#065F46', fontSize: isMobile ? '0.9rem' : '0.88rem', flexShrink: 0, whiteSpace: 'nowrap' }}>{ev.label}</span>
                    <span style={{ color: 'var(--color-ink)', fontWeight: 600, fontSize: isMobile ? '0.9rem' : '0.88rem', flex: '1 1 60%', minWidth: 0, wordBreak: 'keep-all' }}>{ev.title}</span>
                  </li>
                ))}
              </ul>
            )}
            <p style={{ margin: '0.55rem 0 0', fontSize: isMobile ? '0.78rem' : '0.74rem', color: 'var(--color-ink-2)', lineHeight: 1.5 }}>※ 교회의 사정에 따라 일정은 변경될 수 있습니다. (출처: 미스바 목회일정)</p>
          </section>

          {profileId && !profileDone && !activeCommunity && (
            <section style={{ padding: profileExpanded ? (isMobile ? '1.1rem' : '1.5rem') : '1rem 1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', transition: 'padding 0.2s ease' }}>
              <button
                type="button"
                onClick={() => setProfileExpanded((v) => !v)}
                aria-expanded={profileExpanded}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', padding: '0.3rem 0.7rem', borderRadius: 999, background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.78rem' }}>선택사항</span>
                  <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-ink)', fontWeight: 800, letterSpacing: '-0.01em' }}>프로필을 완성해 주세요</h2>
                </div>
                <span style={{ color: 'var(--color-ink-2)', fontSize: '1rem', transform: profileExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', lineHeight: 1 }}>▾</span>
              </button>

              {profileExpanded && (
                <div style={{ marginTop: '1.1rem' }}>
                  <p style={{ margin: '0 0 1rem', color: 'var(--color-ink-2)', fontSize: '0.92rem', lineHeight: 1.6 }}>실명과 연락처를 등록하면 소모임·공동체 관리자가 더 원활히 안내할 수 있어요.</p>
                  <div className="stack-on-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label style={{ color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.88rem' }}>실명</label>
                      <input
                        type="text"
                        value={realName}
                        onChange={(e) => setRealName(e.target.value)}
                        placeholder="실명을 입력하세요"
                        style={{ padding: '0.85rem 0.95rem', borderRadius: 12, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', fontSize: '0.95rem', color: 'var(--color-ink)', minHeight: 44 }}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <label style={{ color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.88rem' }}>연락처</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.5rem' }}>
                        <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} style={{ padding: '0.85rem 0.6rem', borderRadius: 12, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', color: 'var(--color-ink)', appearance: 'none', minHeight: 44 }}>
                          <option value="+65">🇸🇬 +65</option>
                          <option value="+82">🇰🇷 +82</option>
                          <option value="+1">🇺🇸 +1</option>
                          <option value="+44">🇬🇧 +44</option>
                          <option value="+81">🇯🇵 +81</option>
                        </select>
                        <input
                          type="text"
                          value={contact}
                          onChange={(e) => setContact(e.target.value)}
                          placeholder="1111-1111"
                          style={{ padding: '0.85rem 0.95rem', borderRadius: 12, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', fontSize: '0.95rem', color: 'var(--color-ink)', minHeight: 44 }}
                        />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    <span style={{ color: profileMsg?.includes('저장') ? 'var(--color-primary-deep)' : 'var(--color-danger)', fontSize: '0.88rem' }}>{profileMsg || ''}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => setProfileDone(true)} style={{ padding: '0.7rem 1.1rem', minHeight: 44, borderRadius: 10, border: '1px solid var(--color-gray)', background: 'var(--color-surface)', color: 'var(--color-ink-2)', fontWeight: 700, cursor: 'pointer' }}>
                        나중에
                      </button>
                      <button type="button" onClick={saveProfile} disabled={savingProfile} style={{ padding: '0.7rem 1.2rem', minHeight: 44, borderRadius: 10, border: 'none', background: savingProfile ? 'rgba(32, 205, 141, 0.5)' : 'var(--color-primary)', color: '#ffffff', fontWeight: 800, cursor: savingProfile ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-button)' }}>
                        {savingProfile ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
      </AppShell>

      {previewBulletin && (
        <WorshipBulletinPreview value={previewBulletin} onClose={() => setPreviewBulletin(null)} />
      )}

    </>
  );
};

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (context) => {
  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const queryNickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const queryEmail = typeof context.query.email === 'string' ? context.query.email : null;
  const provider = profileId && profileId.includes('-') ? profileId.split('-')[0] : null;

  const [communitiesArr, usersArr, profilesArr] = await Promise.all([
    getCommunities(),
    getUsers(),
    getProfiles().catch(() => [] as any[]),
  ]);

  const communities = communitiesArr as Community[];
  const users = usersArr as UserEntry[];
  const profiles = profilesArr as Array<NonNullable<StoredProfile>>;
  const storedProfile = profileId ? profiles.find((p) => p.profileId === profileId) || null : null;

  const providerPrefix = profileId && profileId.includes('-') ? profileId.split('-')[0] : null;
  const userEntries = profileId
    ? users.filter((entry) => {
        const exactMatch = entry.providerProfileId === profileId;
        const nicknameFallback = providerPrefix && queryNickname && entry.providerProfileId.startsWith(`${providerPrefix}-`) && entry.nickname === queryNickname;
        const emailFallback = queryEmail && entry.profile?.kakao_account?.email === queryEmail;
        return exactMatch || nicknameFallback || emailFallback;
      })
    : [];

  const joinedCommunityIds = profileId ? Array.from(new Set(userEntries.map((user) => user.communityId))) : [];
  const myNickname = queryNickname || userEntries[0]?.nickname || null;
  const myEmail = queryEmail || userEntries[0]?.profile?.kakao_account?.email || null;
  const joinedCommunities = communities
    .filter((community) => joinedCommunityIds.includes(community.id))
    .map((community) => ({
      ...community,
      isAdmin: profileId
        ? community.adminProfileId === profileId
          || (!!providerPrefix && !!myNickname && community.adminProfileId === `${providerPrefix}-${myNickname}`)
          || (!!myEmail && community.adminProfileId === myEmail)
        : false,
    }));

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname: myNickname, email: myEmail });

  return {
    props: {
      profileId,
      provider,
      nickname: queryNickname,
      email: queryEmail,
      joinedCommunities,
      userEntries,
      storedProfile,
      systemAdminHref,
    },
  };
};

export default Dashboard;
