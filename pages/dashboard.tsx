import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useAudio } from '../components/AudioPlayer';
import AppShell from '../components/AppShell';
import ConfirmModal from '../components/ConfirmModal';
import ReservationSlotPicker, { EditReservationPayload } from '../components/ReservationSlotPicker';
import type { Venue, Block, BlockGroup } from '../components/VenueGrid';
import { WorshipBulletinPreview } from '../components/WorshipBulletinEditor';
import { getCommunities, getUsers, getProfiles, getSignupApprovals } from '../lib/dataStore';
import { getSystemAdminHref } from '../lib/adminGuard';
import { useIsMobile } from '../lib/useIsMobile';
import { isAllDayEvent } from '../lib/events';
import { planForDate, formatPlan } from '../lib/readingPlan';

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
  adminCommunities: Community[];
  userEntries: UserEntry[];
  storedProfile: StoredProfile;
  systemAdminHref: string | null;
};

const Dashboard = ({ profileId, provider, nickname, email, joinedCommunities, adminCommunities, userEntries, storedProfile, systemAdminHref }: DashboardProps) => {
  const { t } = useTranslation();
  const audio = useAudio();
  const isMobile = useIsMobile();
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
  type MyReservation = { id: string; title: string; description?: string; startAt: string; endAt: string; location?: string; venueId?: string; seriesId?: string; dateKey?: string };
  const [weekEvents, setWeekEvents] = useState<WeekEvent[] | null>(null);
  const [myReservations, setMyReservations] = useState<MyReservation[] | null>(null);
  // 내 장소예약 수정/삭제 상태
  const [resDeletingId, setResDeletingId] = useState<string | null>(null);
  const [resConfirmTarget, setResConfirmTarget] = useState<MyReservation | null>(null);
  // 수정 모달: ReservationSlotPicker 를 edit 모드로 띄우기 위한 컨텍스트
  type ResCtx = {
    venues: Venue[];
    blocks: Block[];
    groups: BlockGroup[];
    slotMin: number;
    availableStart: string;
    availableEnd: string;
    reservationLimitMode: 'unlimited' | 'perUser';
    reservationLimitPerUser: number;
    bookingWindowMonths: 1 | 2 | 3 | 6;
  };
  const [editModalRes, setEditModalRes] = useState<MyReservation | null>(null);
  const [editCtx, setEditCtx] = useState<ResCtx | null>(null);
  const [editCtxLoading, setEditCtxLoading] = useState(false);
  const [editCtxError, setEditCtxError] = useState<string | null>(null);

  const reloadMyReservations = async () => {
    if (!profileId) return;
    try {
      // 다가오는 예약 전체를 놓치지 않도록 오늘 ~ +12개월 범위로 요청 (서버 기본 ±2개월은 좁음)
      const pad = (n: number) => String(n).padStart(2, '0');
      const now = new Date();
      const fromStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const end = new Date(now); end.setMonth(end.getMonth() + 12);
      const toStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
      const qs = new URLSearchParams({ communityId: 'kcis', type: 'reservation', profileId, from: fromStr, to: toStr });
      const r = await fetch(`/api/events?${qs.toString()}`);
      const d = await r.json();
      const all = Array.isArray(d.events) ? d.events : [];
      const nowTs = Date.now();
      const future = all
        .filter((x: any) => new Date(x.endAt).getTime() >= nowTs)
        .sort((a: any, b: any) => a.startAt.localeCompare(b.startAt));
      setMyReservations(future);
    } catch { /* noop */ }
  };

  // 수정 버튼 클릭 → 컨텍스트 로드 후 모달 오픈
  const onResEditStart = async (r: MyReservation) => {
    setEditModalRes(r);
    setEditCtxError(null);
    setEditCtxLoading(true);
    try {
      const qs = new URLSearchParams();
      if (profileId) qs.set('profileId', profileId);
      if (email) qs.set('email', email);
      const res = await fetch(`/api/reservation-context?${qs.toString()}`);
      if (!res.ok) throw new Error('ctx load failed');
      const d = await res.json();
      setEditCtx({
        venues: d.venues || [],
        blocks: d.blocks || [],
        groups: d.groups || [],
        slotMin: d.slotMin || 30,
        availableStart: d.availableStart || '06:00',
        availableEnd: d.availableEnd || '22:00',
        reservationLimitMode: d.reservationLimitMode || 'unlimited',
        reservationLimitPerUser: d.reservationLimitPerUser || 3,
        bookingWindowMonths: (d.reservationBookingWindowMonths === 2 || d.reservationBookingWindowMonths === 3 || d.reservationBookingWindowMonths === 6) ? d.reservationBookingWindowMonths : 1,
      });
    } catch {
      setEditCtxError('예약 정보를 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setEditCtxLoading(false);
    }
  };
  const closeEditModal = () => {
    setEditModalRes(null);
    setEditCtx(null);
    setEditCtxError(null);
  };
  const onResDelete = (r: MyReservation) => setResConfirmTarget(r);
  const performResDelete = async () => {
    if (!profileId || !resConfirmTarget) return;
    const r = resConfirmTarget;
    setResDeletingId(r.id);
    try {
      const seriesId = (r as any).seriesId || r.id;
      const qs = new URLSearchParams({ id: seriesId, profileId, scope: 'all' });
      const res = await fetch(`/api/events?${qs.toString()}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        alert(j?.error || '삭제 실패');
        return;
      }
      setResConfirmTarget(null);
      await reloadMyReservations();
    } finally {
      setResDeletingId(null);
    }
  };
  // 이번달 목회일정 (미스바 PDF에서 추출)
  type MonthlyItem = { date: string; label: string; title: string };
  const [monthlySchedule, setMonthlySchedule] = useState<{ month: number; items: MonthlyItem[] } | null>(null);
  // 이번주(월~일) 큐티·통독 완료 dateKey 집합
  const [weekReadingDates, setWeekReadingDates] = useState<Set<string>>(new Set());
  // 통독 계획 = 1독 고정. (1독/2독 선택 기능 제거됨)

  // 가입 완료 직후 1회성 환영 배너 — complete.tsx 에서 kcisShowWelcome 플래그 설정
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem('kcisShowWelcome') === '1') {
        setShowWelcome(true);
        window.localStorage.removeItem('kcisShowWelcome');
      }
    } catch {}
  }, []);

  // 관리 대상 커뮤니티 — SSR props 로 받되, URL 쿼리 없이 진입(refresh 등) 시 localStorage 로 pid 복구.
  // 매칭은 **엄격히 profileId 기준**. 다른 provider 로 로그인하면 다른 사용자로 간주 (이메일 교차 매칭 안 함).
  const [effectiveAdminCommunities, setEffectiveAdminCommunities] = useState<Community[]>(adminCommunities);
  useEffect(() => {
    if (adminCommunities.length > 0) { setEffectiveAdminCommunities(adminCommunities); return; }
    let pid: string | null = profileId;
    if (!pid) {
      try { pid = window.localStorage.getItem('kcisProfileId'); } catch {}
    }
    if (!pid) { setEffectiveAdminCommunities([]); return; }
    let cancelled = false;
    fetch('/api/communities')
      .then((r) => r.ok ? r.json() : { communities: [] })
      .then((d: { communities?: Community[] }) => {
        if (cancelled) return;
        const all = Array.isArray(d?.communities) ? d.communities : [];
        setEffectiveAdminCommunities(all.filter((c) => c.adminProfileId === pid));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [adminCommunities, profileId]);
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
    // 서버 기본 ±2개월 창을 넘는 예약까지 포함되도록 오늘 ~ +12개월로 명시적 범위 지정
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const fromStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const end = new Date(now); end.setMonth(end.getMonth() + 12);
    const toStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    const qs = new URLSearchParams({ communityId: 'kcis', type: 'reservation', profileId, from: fromStr, to: toStr });
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
    if (!profileId) { setWeekReadingDates(new Set()); setQtHistoryDates(new Set()); return; }
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
          {showWelcome && (
            <section style={{ padding: isMobile ? '0.9rem 1rem' : '1rem 1.2rem', borderRadius: 16, background: 'linear-gradient(135deg, rgba(32, 205, 141, 0.14) 0%, rgba(190, 242, 100, 0.22) 100%)', border: '1px solid var(--color-primary)', boxShadow: '0 4px 14px rgba(32, 205, 141, 0.18)', display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <span aria-hidden style={{ fontSize: '1.6rem', lineHeight: 1, flexShrink: 0 }}>🎉</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: isMobile ? '0.98rem' : '1.02rem', color: 'var(--color-primary-deep)', fontWeight: 800, display: 'block' }}>ONCELL 에 가입되셨습니다.</strong>
              </div>
              <button
                type="button"
                onClick={() => setShowWelcome(false)}
                aria-label="환영 배너 닫기"
                style={{ background: 'transparent', border: 'none', padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '1rem', color: 'var(--color-ink-2)', fontWeight: 800, borderRadius: 8 }}
              >✕</button>
            </section>
          )}
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
              <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>📍 {t('page.dashboard.myReservations')}</h2>
              <a href="/reservations/grid" style={{ color: 'var(--color-primary-deep)', fontSize: isMobile ? '0.85rem' : '0.82rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 0.25rem' }}>새 예약 →</a>
            </div>
            {!profileId ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>로그인 후 이용해 주세요.</p>
            ) : myReservations === null ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>불러오는 중…</p>
            ) : myReservations.length === 0 ? (
              <div
                style={{
                  marginTop: '0.6rem',
                  padding: isMobile ? '1rem 0.9rem' : '1.1rem 1rem',
                  borderRadius: 12,
                  background: 'var(--color-primary-tint)',
                  border: '1px dashed var(--color-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <span aria-hidden style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>📅</span>
                  <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 800, color: 'var(--color-ink)', fontSize: '0.98rem', lineHeight: 1.3 }}>
                      장소 예약을 시작해볼까요?
                    </p>
                    <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.84rem', lineHeight: 1.5, wordBreak: 'keep-all' }}>
                      예배실·소모임실 등을 30분 단위로 예약할 수 있어요.
                    </p>
                  </div>
                </div>
                <a
                  href="/reservations/grid"
                  style={{
                    alignSelf: 'center',
                    minHeight: 44,
                    padding: '0.55rem 1.15rem',
                    borderRadius: 10,
                    background: 'var(--color-primary)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.92rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    boxShadow: '0 2px 8px rgba(32, 205, 141, 0.22)',
                  }}
                >
                  장소 예약하러 가기 →
                </a>
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0, display: 'grid', gap: isMobile ? '0.55rem' : '0.45rem' }}>
                {myReservations.map((r) => {
                  const s = new Date(r.startAt);
                  const e = new Date(r.endAt);
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const labels = ['일', '월', '화', '수', '목', '금', '토'];
                  const dateStr = `${pad(s.getMonth() + 1)}/${pad(s.getDate())} (${labels[s.getDay()]})`;
                  const timeStr = `${pad(s.getHours())}:${pad(s.getMinutes())}~${pad(e.getHours())}:${pad(e.getMinutes())}`;
                  const isDeleting = resDeletingId === r.id;
                  const isLoadingEdit = editCtxLoading && editModalRes?.id === r.id;
                  return (
                    <li key={r.id} style={{ padding: isMobile ? '0.65rem 0.85rem' : '0.55rem 0.75rem', borderRadius: 10, background: '#ECFCCB', border: '1px solid #D9F09E', display: 'grid', gap: '0.35rem', fontSize: '0.88rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: '#3F6212', fontWeight: 800 }}>{dateStr}</span>
                        <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{timeStr}</span>
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.3rem' }}>
                          <button
                            type="button"
                            onClick={() => onResEditStart(r)}
                            disabled={isDeleting || isLoadingEdit}
                            style={{ padding: '0.25rem 0.6rem', minHeight: 32, borderRadius: 8, border: '1px solid #65A30D', background: '#fff', color: '#3F6212', fontSize: '0.78rem', fontWeight: 800, cursor: (isDeleting || isLoadingEdit) ? 'not-allowed' : 'pointer' }}
                          >{isLoadingEdit ? '열리는 중…' : '수정'}</button>
                          <button
                            type="button"
                            onClick={() => onResDelete(r)}
                            disabled={isDeleting}
                            style={{ padding: '0.25rem 0.6rem', minHeight: 32, borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: '0.78rem', fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer' }}
                          >{isDeleting ? '삭제중…' : '삭제'}</button>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--color-ink)', fontWeight: isMobile ? 700 : 400 }}>{r.title}</span>
                        {r.location && <span style={{ color: 'var(--color-ink-2)', fontSize: '0.82rem' }}>📍 {r.location}</span>}
                      </div>
                    </li>
                  );
                })}
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
              { emoji: '🌿', title: cur === 1 ? `${cur}일 묵상 중` : `${cur}일 연속 묵상 중`, sub: '첫걸음을 내딛었어요. 내일도 이어가볼까요?', ring: '#BBF7D0', bg: '#F0FDF4', fg: '#15803D' },
              { emoji: '✨', title: `${cur}일 연속 — 습관이 시작됐어요`, sub: '작은 반복이 큰 변화를 만듭니다.', ring: '#D9F09E', bg: '#F7FEE7', fg: '#3F6212' },
              { emoji: '🔥', title: `${cur}일 연속 — 일주일 달성!`, sub: '영적 리듬이 자리잡고 있어요.', ring: '#FCD34D', bg: '#FEF3C7', fg: '#92400E' },
              { emoji: '🏆', title: `${cur}일 연속 — 2주 돌파!`, sub: '꾸준함이 빛납니다. 계속 나아가요.', ring: '#FBBF24', bg: '#FEF3C7', fg: '#78350F' },
              { emoji: '👑', title: `${cur}일 연속 — 한 달의 기록`, sub: '놀라운 꾸준함이에요. 축복합니다 🙌', ring: '#F59E0B', bg: '#FEF3C7', fg: '#78350F' },
              { emoji: '💎', title: `${cur}일 연속 — 반백 일!`, sub: '이 기록이 교회의 자랑입니다.', ring: '#60A5FA', bg: '#DBEAFE', fg: '#1E3A8A' },
              { emoji: '🕊️', title: `${cur}일 연속 — 100일의 은혜`, sub: '하나님이 주신 귀한 기록입니다.', ring: '#A78BFA', bg: '#EDE9FE', fg: '#5B21B6' },
            ];
            const tier = tiers[lv];
            // 오늘 묵상 했는지 여부 (오늘 아직인데 어제 이어짐은 current>0 + today 체크)
            const padN2 = (n: number) => String(n).padStart(2, '0');
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const tk = `${today.getFullYear()}-${padN2(today.getMonth() + 1)}-${padN2(today.getDate())}`;
            const doneToday = qtHistoryDates.has(tk);
            const qtHref = `/qt${profileId ? `?profileId=${encodeURIComponent(profileId)}${nickname ? `&nickname=${encodeURIComponent(nickname)}` : ''}${email ? `&email=${encodeURIComponent(email)}` : ''}` : ''}`;
            // lv 1 (cur === 1) 에서 오늘 아직 묵상 안 한 경우 "내일도" 는 어색. "오늘도 이어가볼까요?" 로 분기.
            const tierSub = (lv === 1 && !doneToday)
              ? '첫걸음을 내딛었어요. 오늘도 이어가볼까요?'
              : tier.sub;

            // 첫 접속 / streak 0 — 장소예약과 동일한 톤의 온보딩 empty-state 로 렌더.
            // (트로피·7일 pill 은 숨기고, 깔끔한 시작 유도 카드만 노출)
            if (lv === 0) {
              return (
                <section style={cardBase}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h2 style={{ ...sectionTitle, fontSize: '1.05rem', margin: 0 }}>{t('page.dashboard.qtCard')}</h2>
                    <span style={{ fontSize: '0.7rem', color: '#65A30D', fontWeight: 600, lineHeight: 1.4 }}>
                      {t('page.dashboard.qtEncourage')}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: '0.6rem',
                      padding: isMobile ? '1rem 0.9rem' : '1.1rem 1rem',
                      borderRadius: 12,
                      background: 'var(--color-primary-tint)',
                      border: '1px dashed var(--color-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <span aria-hidden style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>🌱</span>
                      <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 800, color: 'var(--color-ink)', fontSize: '0.98rem', lineHeight: 1.3 }}>
                          오늘 묵상을 시작해볼까요?
                        </p>
                        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.84rem', lineHeight: 1.5, wordBreak: 'keep-all' }}>
                          매일성경 본문을 읽고<br />느낀 점을 짧게 기록해요.
                        </p>
                      </div>
                    </div>
                    <a
                      href={qtHref}
                      style={{
                        alignSelf: 'center',
                        minHeight: 44,
                        padding: '0.55rem 1.15rem',
                        borderRadius: 10,
                        background: 'var(--color-primary)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.92rem',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        boxShadow: '0 2px 8px rgba(32, 205, 141, 0.22)',
                      }}
                    >
                      ✍️ 오늘 묵상 시작하기 →
                    </a>
                  </div>
                </section>
              );
            }

            return (
              <section style={cardBase}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h2 style={{ ...sectionTitle, fontSize: '1.05rem', margin: 0 }}>{t('page.dashboard.qtCard')}</h2>
                  <span style={{ fontSize: '0.7rem', color: '#65A30D', fontWeight: 600, lineHeight: 1.4 }}>
                    {t('page.dashboard.qtEncourage')}
                  </span>
                </div>
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: 14, background: tier.bg, border: `1px solid ${tier.ring}` }}>
                  <span aria-hidden style={{ fontSize: '2.4rem', lineHeight: 1 }}>{tier.emoji}</span>
                  <div style={{ display: 'grid', gap: '0.2rem', flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '1rem', color: tier.fg, fontWeight: 800, lineHeight: 1.25 }}>{tier.title}</strong>
                    <span style={{ fontSize: '0.82rem', color: tier.fg, opacity: 0.9, fontWeight: 600, lineHeight: 1.45 }}>{tierSub}</span>
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
                  <a
                    href={qtHref}
                    title="오늘의 큐티 보기"
                    style={{
                      marginTop: '0.6rem',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0.65rem 1rem', minHeight: 44,
                      borderRadius: 10,
                      background: 'var(--color-primary)',
                      color: '#fff',
                      border: '1.5px solid var(--color-primary)',
                      fontWeight: 800, fontSize: '0.92rem',
                      textDecoration: 'none',
                      width: isMobile ? '100%' : 'auto',
                      letterSpacing: '-0.01em',
                      wordBreak: 'keep-all',
                      textAlign: 'center',
                    }}
                  >
                    ✓ 오늘 묵상 완료 — 내일도 이어가요!
                  </a>
                )}

                {/* 최근 7일 큐티 현황 — 원형 pill. 완료=민트 / 미완료=흰 / 오늘 미완료=펄스 유도 */}
                {(() => {
                  const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
                  const padZ = (n: number) => String(n).padStart(2, '0');
                  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
                  const days = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(today0);
                    d.setDate(today0.getDate() - (6 - i));
                    return { date: d, key: `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`, isToday: i === 6 };
                  });
                  const todayKey = days[6].key;
                  const todayDone = qtHistoryDates.has(todayKey);
                  return (
                    <div style={{ marginTop: '0.75rem' }}>
                      <style>{`@keyframes kcisQtTodayPulse { 0%,100% { box-shadow: inset 0 0 0 0 rgba(32,205,141,0); background:#fff; } 50% { box-shadow: inset 0 0 0 3px rgba(32,205,141,0.55); background:#ECFDF5; } }`}</style>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: isMobile ? '0.25rem' : '0.3rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2 }}>
                        {days.map((d) => {
                          const done = qtHistoryDates.has(d.key);
                          const dow = d.date.getDay();
                          const dowLabel = DOWS[dow];
                          const dowColor = dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : 'var(--color-ink-2)';
                          const shouldPulse = d.isToday && !done;
                          const size = d.isToday ? (isMobile ? 56 : 48) : (isMobile ? 38 : 34);
                          const linkParams = new URLSearchParams();
                          if (profileId) linkParams.set('profileId', profileId);
                          if (nickname) linkParams.set('nickname', nickname);
                          if (email) linkParams.set('email', email);
                          linkParams.set('date', d.key);
                          const href = `/qt?${linkParams.toString()}`;
                          // 도메인 규칙: 큐티는 오늘만 작성 가능. 과거는 읽기 모드 표시.
                          const readOnlyPast = !d.isToday;
                          return (
                            <a
                              key={d.key}
                              href={href}
                              title={`${d.key}${done ? ' · 큐티 완료' : d.isToday ? ' · 오늘 미완료' : ' · 📖 보기 모드 (큐티는 오늘만 작성 가능)'} — 클릭해서 이동`}
                              style={{
                                flex: '0 0 auto',
                                width: size, height: size,
                                borderRadius: '50%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: done ? 'var(--color-primary)' : '#fff',
                                color: done ? '#fff' : dowColor,
                                border: `1.5px solid ${done ? '#20CD8D' : d.isToday ? '#20CD8D' : '#E5E7EB'}`,
                                fontWeight: 800,
                                fontSize: d.isToday ? (isMobile ? '0.7rem' : '0.68rem') : (isMobile ? '0.82rem' : '0.78rem'),
                                lineHeight: 1.1,
                                textAlign: 'center',
                                textDecoration: 'none',
                                cursor: 'pointer',
                                opacity: readOnlyPast && !done ? 0.7 : 1,
                                animation: shouldPulse ? 'kcisQtTodayPulse 1.6s ease-in-out infinite' : undefined,
                              }}
                            >
                              {d.isToday ? (
                                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                  <span>{dowLabel}</span>
                                  <span style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.85 }}>(오늘)</span>
                                </span>
                              ) : (
                                dowLabel
                              )}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </section>
            );
          })()}

          {/* 성경통독 이번주 기록 — 통독 단독 측정 (QT 합산 아님). 0~7일 스케일. */}
          {profileId && (() => {
            const rd = weekReadingDates.size;  // 0~7
            const level = rd >= 7 ? 5 : rd >= 6 ? 4 : rd >= 4 ? 3 : rd >= 2 ? 2 : rd >= 1 ? 1 : 0;
            const badges = [
              { emoji: '🌱', title: '이번주 함께 시작해볼까요?', sub: '작은 한 걸음부터 시작이에요.', ring: '#E5E7EB', bg: '#F9FAFB', fg: '#6B7280' },
              { emoji: '🌿', title: '시작이 좋아요!', sub: '오늘 한 걸음 더 내딛어봐요.', ring: '#BBF7D0', bg: '#F0FDF4', fg: '#15803D' },
              { emoji: '✨', title: '꾸준함이 멋져요', sub: '이번주 마무리까지 화이팅!', ring: '#D9F09E', bg: '#F7FEE7', fg: '#3F6212' },
              { emoji: '🔥', title: '대단합니다!', sub: '영적 근력이 자라고 있어요.', ring: '#FCD34D', bg: '#FEF3C7', fg: '#92400E' },
              { emoji: '🏆', title: '정말 훌륭해요!', sub: '하루만 더하면 완벽한 주간이에요.', ring: '#FBBF24', bg: '#FEF3C7', fg: '#78350F' },
              { emoji: '👑', title: '완벽한 한 주!', sub: '은혜가 가득한 기록이네요. 축복합니다 🙌', ring: '#F59E0B', bg: '#FEF3C7', fg: '#78350F' },
            ];
            const b = badges[level];
            const readingHref =`/reading${profileId ? `?profileId=${encodeURIComponent(profileId)}${nickname ? `&nickname=${encodeURIComponent(nickname)}` : ''}${email ? `&email=${encodeURIComponent(email)}` : ''}` : ''}`;

            // 오늘 통독 범위 — 사용자 선택 플랜(1독/2독) 반영. DB 일치 안 할 수 있어 fallback 성격.
            const todayRangeText = formatPlan(planForDate(new Date(), 1));
            const planBadge = '1년1독목표';
            const today0ReadingMsg = new Date(); today0ReadingMsg.setHours(0, 0, 0, 0);
            const todayKeyReadingMsg = `${today0ReadingMsg.getFullYear()}-${String(today0ReadingMsg.getMonth() + 1).padStart(2, '0')}-${String(today0ReadingMsg.getDate()).padStart(2, '0')}`;
            const readingDoneToday = weekReadingDates.has(todayKeyReadingMsg);

            // 첫 접속 / 이번주 활동 0 — 온보딩 empty-state (장소예약·QT 카드와 동일 톤)
            if (level === 0) {
              return (
                <section style={cardBase}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h2 style={{ ...sectionTitle, fontSize: '1.05rem', margin: 0 }}>{t('page.dashboard.readingCard')}</h2>
                    <span style={{ fontSize: '0.7rem', color: '#65A30D', fontWeight: 600, lineHeight: 1.4 }}>
                      {t('page.reading.encourage')}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: '0.6rem',
                      padding: isMobile ? '1rem 0.9rem' : '1.1rem 1rem',
                      borderRadius: 12,
                      background: 'var(--color-primary-tint)',
                      border: '1px dashed var(--color-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <span aria-hidden style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>🌱</span>
                      <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 800, color: 'var(--color-ink)', fontSize: '0.98rem', lineHeight: 1.3 }}>
                          성경통독을 시작해볼까요?
                        </p>
                        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.84rem', lineHeight: 1.5, wordBreak: 'keep-all' }}>
                          하루 정해진 분량을 꾸준히,<br />1년 완독의 여정을 함께해요.
                        </p>
                      </div>
                    </div>
                    <a
                      href={readingHref}
                      style={{
                        alignSelf: 'center',
                        minHeight: 44,
                        padding: '0.55rem 1.15rem',
                        borderRadius: 10,
                        background: 'var(--color-primary)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.92rem',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        boxShadow: '0 2px 8px rgba(32, 205, 141, 0.22)',
                      }}
                    >
                      📖 성경통독 시작하기 →
                    </a>
                  </div>
                </section>
              );
            }

            return (
              <section style={cardBase}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h2 style={{ ...sectionTitle, fontSize: '1.05rem', margin: 0 }}>{t('page.dashboard.readingCard')}</h2>
                  <span style={{ fontSize: '0.7rem', color: '#65A30D', fontWeight: 600, lineHeight: 1.4 }}>
                    {t('page.reading.encourage')}
                  </span>
                </div>
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.85rem 1rem', borderRadius: 14, background: b.bg, border: `1px solid ${b.ring}` }}>
                  <span aria-hidden style={{ fontSize: '2.2rem', lineHeight: 1 }}>{b.emoji}</span>
                  <div style={{ display: 'grid', gap: '0.15rem', flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: '1rem', color: b.fg, fontWeight: 800 }}>{b.title}</strong>
                    <span style={{ fontSize: '0.82rem', color: b.fg, opacity: 0.85, fontWeight: 600 }}>{b.sub}</span>
                  </div>
                </div>
                {/* 오늘 통독 CTA — QT 카드와 동일 스타일. 범위 메시지를 버튼 안에 담음. 플랜(1/2독) 배지 포함. */}
                {!readingDoneToday && todayRangeText && (
                  <a
                    href={readingHref}
                    style={{
                      marginTop: '0.6rem',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                      padding: '0.65rem 1rem', minHeight: 44,
                      borderRadius: 10,
                      background: 'var(--color-primary)',
                      color: '#fff',
                      border: '1.5px solid var(--color-primary)',
                      fontWeight: 800, fontSize: '0.92rem',
                      textDecoration: 'none',
                      width: isMobile ? '100%' : 'auto',
                      letterSpacing: '-0.01em',
                      wordBreak: 'keep-all',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ padding: '0.08rem 0.4rem', borderRadius: 999, background: 'rgba(255,255,255,0.22)', color: '#fff', fontSize: '0.7rem', fontWeight: 800, border: '1px solid rgba(255,255,255,0.5)' }}>{planBadge}</span>
                    <span>📖 오늘은 {todayRangeText} — 10분이면 돼요</span>
                  </a>
                )}
                {readingDoneToday && todayRangeText && (
                  <div style={{ marginTop: '0.6rem', fontSize: '0.85rem', color: '#15803D', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ padding: '0.08rem 0.4rem', borderRadius: 999, background: '#fff', color: '#15803D', fontSize: '0.7rem', fontWeight: 800, border: '1px solid #15803D' }}>{planBadge}</span>
                    <span>✓ 오늘 {todayRangeText} 완독 — 내일도 이어가요!</span>
                  </div>
                )}

                {/* 최근 7일 성경통독 원형 요일 기록 — 완료=민트, 오늘 미완료면 펄스 유도 */}
                {(() => {
                  const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
                  const padZ = (n: number) => String(n).padStart(2, '0');
                  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
                  const days = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(today0);
                    d.setDate(today0.getDate() - (6 - i));
                    return { date: d, key: `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`, isToday: i === 6 };
                  });
                  const todayKey = days[6].key;
                  const todayDone = weekReadingDates.has(todayKey);
                  return (
                    <div style={{ marginTop: '0.75rem' }}>
                      <style>{`@keyframes kcisReadingTodayPulse { 0%,100% { box-shadow: inset 0 0 0 0 rgba(32,205,141,0); background:#fff; } 50% { box-shadow: inset 0 0 0 3px rgba(32,205,141,0.55); background:#ECFDF5; } }`}</style>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: isMobile ? '0.25rem' : '0.3rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2 }}>
                        {days.map((d) => {
                          const done = weekReadingDates.has(d.key);
                          const dow = d.date.getDay();
                          const dowLabel = DOWS[dow];
                          const dowColor = dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : 'var(--color-ink-2)';
                          const shouldPulse = d.isToday && !done;
                          const size = d.isToday ? (isMobile ? 56 : 48) : (isMobile ? 38 : 34);
                          const linkParams = new URLSearchParams();
                          if (profileId) linkParams.set('profileId', profileId);
                          if (nickname) linkParams.set('nickname', nickname);
                          if (email) linkParams.set('email', email);
                          linkParams.set('date', d.key);
                          const href = `/reading?${linkParams.toString()}`;
                          return (
                            <a
                              key={d.key}
                              href={href}
                              title={`${d.key}${done ? ' · 통독 완료' : d.isToday ? ' · 오늘 미완료' : ''} — 클릭해서 이동`}
                              style={{
                                flex: '0 0 auto',
                                width: size, height: size,
                                borderRadius: '50%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: done ? 'var(--color-primary)' : '#fff',
                                color: done ? '#fff' : dowColor,
                                border: `1.5px solid ${done ? '#20CD8D' : d.isToday ? '#20CD8D' : '#E5E7EB'}`,
                                fontWeight: 800,
                                fontSize: d.isToday ? (isMobile ? '0.7rem' : '0.68rem') : (isMobile ? '0.82rem' : '0.78rem'),
                                lineHeight: 1.1,
                                textAlign: 'center',
                                textDecoration: 'none',
                                cursor: 'pointer',
                                animation: shouldPulse ? 'kcisReadingTodayPulse 1.6s ease-in-out infinite' : undefined,
                              }}
                            >
                              {d.isToday ? (
                                <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                  <span>{dowLabel}</span>
                                  <span style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.85 }}>(오늘)</span>
                                </span>
                              ) : (
                                dowLabel
                              )}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
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
                  return null;
                })()}
              </section>
            );
          })()}

          <section style={cardBase}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ ...sectionTitle, fontSize: '1.05rem', margin: 0 }}>📅 교회일정</h2>
            </div>
            {!monthlySchedule ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>목회일정 불러오는 중…</p>
            ) : monthlySchedule.items.length === 0 ? (
              <p style={{ ...helperText, marginTop: '0.55rem', color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>이번달 목회일정 정보가 아직 준비되지 않았습니다.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: '0.5rem 0 0', padding: 0, display: 'grid', gap: '0.2rem' }}>
                {(() => {
                  const pad = (n: number) => String(n).padStart(2, '0');
                  const today = new Date();
                  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
                  return monthlySchedule.items.map((ev, i) => {
                    const isUpcoming = typeof ev.date === 'string' && ev.date >= todayKey;
                    const bg = isUpcoming ? '#ECFCCB' : (i % 2 === 0 ? '#F9FCFB' : 'transparent');
                    return (
                      <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem', padding: '0.3rem 0.7rem', borderRadius: 8, background: bg, flexWrap: 'wrap', lineHeight: 1.35, border: isUpcoming ? '1px solid #D9F09E' : 'none' }}>
                        <span style={{ fontWeight: 800, color: isUpcoming ? '#3F6212' : '#065F46', fontSize: '0.82rem', flexShrink: 0, whiteSpace: 'nowrap', minWidth: isMobile ? 56 : 70 }}>{ev.label}</span>
                        <span style={{ color: 'var(--color-ink)', fontWeight: isUpcoming ? 700 : 500, fontSize: '0.82rem', flex: '1 1 auto', minWidth: 0, wordBreak: 'keep-all' }}>{ev.title}</span>
                      </li>
                    );
                  });
                })()}
              </ul>
            )}
            <p style={{ margin: '0.55rem 0 0', fontSize: isMobile ? '0.78rem' : '0.74rem', color: 'var(--color-ink-2)', lineHeight: 1.5 }}>※ 교회의 사정에 따라 일정은 변경될 수 있습니다. (출처: 미스바 목회일정)</p>
          </section>

          {/* 내 공동체 — 공동체 관리자인 경우에만 노출 (대시보드 마지막 섹션) */}
          {(() => {
            if (effectiveAdminCommunities.length === 0) return null;
            return (
              <section id="community" style={{ ...cardBase, padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h2 style={{ ...sectionTitle, fontSize: '1.05rem' }}>
                    내 공동체 <span style={{ color: 'var(--color-ink-2)', fontWeight: 700 }}>({effectiveAdminCommunities.length})</span>
                  </h2>
                </div>
                <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {effectiveAdminCommunities.map((community) => {
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
                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, background: 'var(--color-ink)', color: '#ffffff', fontSize: '0.68rem', fontWeight: 700 }}>관리자</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })()}

      </AppShell>

      {previewBulletin && (
        <WorshipBulletinPreview value={previewBulletin} onClose={() => setPreviewBulletin(null)} />
      )}

      {editModalRes && (() => {
        // venueId 복원: 블럭 id 패턴 occ-<seriesId>:<dateKey>, venueId 는 reservation occurrence 에 포함.
        // ctx 로드 후 reservation 자체의 venueId 를 찾아야 함 — SSR 에서 MyReservation 에 venueId 가 없다면 location 매칭.
        const r = editModalRes;
        const venueId = r.venueId || (editCtx?.venues || []).find((v) => r.location?.includes(`(${v.code})`))?.id || '';
        const fixedVenue = (editCtx?.venues || []).find((v) => v.id === venueId);
        const dateStr = r.startAt.slice(0, 10);
        const startDate = new Date(r.startAt);
        const endDate = new Date(r.endAt);
        const startMin = startDate.getHours() * 60 + startDate.getMinutes();
        const endMin = endDate.getHours() * 60 + endDate.getMinutes();
        const editPayload: EditReservationPayload = {
          id: r.id,
          seriesId: r.seriesId || r.id,
          dateKey: r.dateKey || dateStr,
          date: dateStr,
          venueId,
          startMin,
          endMin,
          description: r.description || r.title || '',
        };
        return (
          <div
            onClick={(e) => { if (e.target === e.currentTarget) closeEditModal(); }}
            style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem' }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="예약 수정"
              style={{
                width: '100%',
                maxWidth: 1100,
                maxHeight: isMobile ? '94dvh' : '92vh',
                background: '#fff',
                borderRadius: isMobile ? '18px 18px 0 0' : 16,
                boxShadow: '0 -8px 40px rgba(0,0,0,0.22)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}
            >
              <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>📍 예약 수정</h3>
                <button type="button" onClick={closeEditModal} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40 }}>✕</button>
              </div>
              <div style={{ padding: isMobile ? '0.85rem 0.75rem 1.5rem' : '1.1rem 1.2rem', overflowY: 'auto', display: 'grid', gap: isMobile ? '0.85rem' : '1rem' }}>
                {editCtxLoading ? (
                  <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' }}>예약 정보를 불러오는 중…</p>
                ) : editCtxError ? (
                  <p style={{ margin: 0, color: '#B91C1C', fontSize: '0.9rem', fontWeight: 700, textAlign: 'center', padding: '1rem 0' }}>⚠ {editCtxError}</p>
                ) : editCtx && fixedVenue ? (
                  <ReservationSlotPicker
                    mode="edit"
                    venues={editCtx.venues}
                    blocks={editCtx.blocks}
                    groups={editCtx.groups}
                    slotMin={editCtx.slotMin}
                    availableStart={editCtx.availableStart}
                    availableEnd={editCtx.availableEnd}
                    reservationLimitMode={editCtx.reservationLimitMode}
                    bookingWindowMonths={editCtx.bookingWindowMonths}
                    reservationLimitPerUser={editCtx.reservationLimitPerUser}
                    profileId={profileId}
                    displayName={storedProfile?.realName || userEntries[0]?.realName || userEntries[0]?.nickname || nickname || null}
                    contact={storedProfile?.contact || null}
                    nickname={nickname}
                    email={email}
                    isAdmin={!!systemAdminHref}
                    editReservation={editPayload}
                    onSubmitted={async () => { closeEditModal(); await reloadMyReservations(); }}
                    onCancel={closeEditModal}
                  />
                ) : (
                  <p style={{ margin: 0, color: '#B91C1C', fontSize: '0.9rem', fontWeight: 700, textAlign: 'center', padding: '1rem 0' }}>장소 정보를 찾지 못했습니다.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmModal
        open={!!resConfirmTarget}
        title="이 예약을 삭제하시겠어요?"
        details={resConfirmTarget ? [
          resConfirmTarget.title || '(제목 없음)',
          `${resConfirmTarget.startAt.slice(0, 10)} ${resConfirmTarget.startAt.slice(11, 16)}~${resConfirmTarget.endAt.slice(11, 16)}`,
          resConfirmTarget.location || '',
        ].filter(Boolean) : []}
        warning="삭제 후에는 되돌릴 수 없습니다."
        confirmLabel="삭제"
        confirmTone="danger"
        busy={!!resDeletingId}
        onCancel={() => setResConfirmTarget(null)}
        onConfirm={performResDelete}
      />
    </>
  );
};

export const getServerSideProps: GetServerSideProps<DashboardProps> = async (context) => {
  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const queryNickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const queryEmail = typeof context.query.email === 'string' ? context.query.email : null;
  const provider = profileId && profileId.includes('-') ? profileId.split('-')[0] : null;

  const [communitiesArr, usersArr, profilesArr, approvalsArr] = await Promise.all([
    getCommunities(),
    getUsers(),
    getProfiles().catch(() => [] as any[]),
    getSignupApprovals().catch(() => [] as any[]),
  ]);

  const communities = communitiesArr as Community[];
  const users = usersArr as UserEntry[];
  const profiles = profilesArr as Array<NonNullable<StoredProfile>>;
  const approvals = approvalsArr as Array<{ profileId: string; realName?: string; contact?: string }>;
  const rawProfile = profileId ? profiles.find((p) => p.profileId === profileId) || null : null;
  const approval = profileId ? approvals.find((a) => a.profileId === profileId) || null : null;
  // signup 시점에 realName/contact 를 입력하면 signup_approvals 에 저장되고 profiles에는 없을 수 있음.
  // 두 소스를 merge해서 storedProfile 이 빠짐없이 반영되도록.
  const storedProfile: StoredProfile = rawProfile
    ? {
        ...rawProfile,
        realName: rawProfile.realName || approval?.realName || '',
        contact: rawProfile.contact || approval?.contact || '',
      }
    : (approval && (approval.realName || approval.contact))
      ? ({
          profileId: profileId as string,
          provider: (profileId && profileId.includes('-') ? profileId.split('-')[0] : '') as string,
          nickname: queryNickname || '',
          realName: approval.realName || '',
          contact: approval.contact || '',
          email: queryEmail || '',
          updatedAt: '',
        } as NonNullable<StoredProfile>)
      : null;

  // "다른 userId = 다른 사용자" 원칙 — profileId 엄격 매칭. email/nickname 교차 매칭 금지.
  const userEntries = profileId
    ? users.filter((entry) => entry.providerProfileId === profileId)
    : [];

  const joinedCommunityIds = profileId ? Array.from(new Set(userEntries.map((user) => user.communityId))) : [];
  const myNickname = queryNickname || userEntries[0]?.nickname || null;
  const myEmail = queryEmail || userEntries[0]?.profile?.kakao_account?.email || null;
  const isUserAdminOf = (community: Community): boolean =>
    !!profileId && community.adminProfileId === profileId;

  const joinedCommunities = communities
    .filter((community) => joinedCommunityIds.includes(community.id))
    .map((community) => ({ ...community, isAdmin: isUserAdminOf(community) }));

  // 관리 대상 커뮤니티 — oncell_users 가입 기록과 무관하게 adminProfileId 기준으로 직접 산출.
  const adminCommunities = communities.filter(isUserAdminOf);

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname: myNickname, email: myEmail });

  return {
    props: {
      profileId,
      provider,
      nickname: queryNickname,
      email: queryEmail,
      joinedCommunities,
      adminCommunities,
      userEntries,
      storedProfile,
      systemAdminHref,
    },
  };
};

export default Dashboard;
