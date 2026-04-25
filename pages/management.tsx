import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../components/AppShell';
import AdminTabBar from '../components/AdminTabBar';
import CommunityBadge from '../components/CommunityBadge';
import DateTimePicker from '../components/DateTimePicker';
import WorshipBulletinEditor, { WorshipBulletinPreview } from '../components/WorshipBulletinEditor';
import { getSystemAdminHref, requireAdminAccessSSR } from '../lib/adminGuard';
import { useIsMobile } from '../lib/useIsMobile';
import { isAllDayEvent, getSGDateKey, getSGTodayKey, addDaysToKey } from '../lib/events';
import { categoryColorFor, sortCategories } from '../lib/categoryColors';
import { getCommunities, getUsers } from '../lib/dataStore';

type Community = {
  id: string;
  name: string;
  adminProfileId?: string;
  joinApprovalMode?: 'auto' | 'admin';
  requireRealName?: boolean;
  timezone?: string;
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

type ManagementProps = {
  profileId: string | null;
  joinedCommunities: Array<Community & { isAdmin: boolean }>;
  adminCommunities: Array<Community & { isAdmin: boolean }>;
  userEntries: UserEntry[];
  systemAdminHref: string | null;
};

type CalendarEvent = {
  id: string;
  communityId: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  description?: string;
  scope?: 'community' | 'personal';
  shared?: boolean;
  createdBy?: string;
  createdByName?: string;
  recurrenceId?: string;
};

const ManagementPage = ({ profileId, joinedCommunities, adminCommunities, userEntries, systemAdminHref }: ManagementProps) => {
  const mgmtRouter = useRouter();
  const isMobile = useIsMobile();
  const mgmtCommunityId = typeof mgmtRouter.query.communityId === 'string' ? mgmtRouter.query.communityId : null;
  const scopedAdminCommunities = mgmtCommunityId
    ? adminCommunities.filter((c) => c.id === mgmtCommunityId)
    : adminCommunities;
  const [settings, setSettings] = useState<Record<string, 'auto' | 'admin'>>({});
  const [realNameSettings, setRealNameSettings] = useState<Record<string, boolean>>({});
  const [savingCommunityId, setSavingCommunityId] = useState<string | null>(null);
  const [savingRealNameId, setSavingRealNameId] = useState<string | null>(null);
  const [tzSettings, setTzSettings] = useState<Record<string, string>>({});
  const [savingTzId, setSavingTzId] = useState<string | null>(null);
  const [members, setMembers] = useState<UserEntry[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  type WorshipService = { id: string; name: string; startAt: string; createdAt: string; bulletin?: any; resolvedBulletin?: any; bulletinTemplateId?: string; recurrence?: string; recurrenceId?: string; communityId?: string };
  const formatRecurrenceTime = (s: WorshipService) => {
    const d = new Date(s.startAt);
    const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    const ampm = d.getHours() < 12 ? '오전' : '오후';
    const h12 = ((d.getHours() + 11) % 12) + 1;
    const mm = String(d.getMinutes()).padStart(2, '0');
    const time = `${ampm} ${h12}:${mm}`;
    if (s.recurrence === 'weekly') return `매주 ${dow}요일 ${time}`;
    if (s.recurrence === 'monthly') return `매월 ${d.getDate()}일 ${time}`;
    if (s.recurrence === 'daily') return `매일 ${time}`;
    return d.toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const bulletinThumb = (s: WorshipService): string | null => {
    const b = s.bulletin ?? s.resolvedBulletin;
    const bg = b?.design?.background ?? b?.background;
    if (!bg) return null;
    if (bg.type === 'default') return bg.value === 'default2' ? '/images/bg2.png' : '/images/bg1.png';
    if (bg.type === 'upload' && bg.dataUrl) return bg.dataUrl;
    return null;
  };
  const [worshipServices, setWorshipServices] = useState<WorshipService[]>([]);
  const [worshipListPage, setWorshipListPage] = useState(1);
  const [worshipView, setWorshipView] = useState<'list' | 'calendar'>('list');
  const [communityDesign, setCommunityDesign] = useState<any>({ background: { type: 'default', value: 'default1' }, logo: null, churchName: '', worshipLabel: 'WORSHIP', homepage: '', footer: '' });
  const [communityContent, setCommunityContent] = useState<any>({});
  const [designSaving, setDesignSaving] = useState(false);
  const [designMsg, setDesignMsg] = useState<string | null>(null);
  const [wsForm, setWsForm] = useState<{ name: string; startAt: string; generateBulletin: boolean; location: string }>({ name: '주일예배', startAt: '', generateBulletin: true, location: '' });
  const [wsRecurType, setWsRecurType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [wsRecurUnit, setWsRecurUnit] = useState<'week' | 'month'>('week');
  const [wsRecurDays, setWsRecurDays] = useState<number[]>([]);
  const [wsRecurWeeks, setWsRecurWeeks] = useState<number[]>([]);
  const [wsRecurEndType, setWsRecurEndType] = useState<'count' | 'until'>('count');
  const [wsRecurCount, setWsRecurCount] = useState<number>(10);
  const [wsRecurUntil, setWsRecurUntil] = useState<string>('');
  const [wsCreating, setWsCreating] = useState(false);
  const [wsMsg, setWsMsg] = useState<string | null>(null);
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<WorshipService | null>(null);
  const [editingBulletin, setEditingBulletin] = useState<any>(null);
  const [previewBulletin, setPreviewBulletin] = useState<any>(null);
  const [editingSaving, setEditingSaving] = useState(false);

  const saveServiceBulletin = async () => {
    if (!editingService || !mgmtCommunityId) return;
    setEditingSaving(true);
    try {
      const res = await fetch(`/api/communities/${encodeURIComponent(mgmtCommunityId)}/worship-services`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId: editingService.id, bulletin: editingBulletin, markEdited: true }),
      });
      if (!res.ok) throw new Error('저장 실패');
      await loadWorshipServices();
      setEditingService(null);
      setEditingBulletin(null);
    } catch (e: any) {
      window.alert(e?.message || '저장 실패');
    } finally {
      setEditingSaving(false);
    }
  };
  const [deleteModal, setDeleteModal] = useState<{ target: CalendarEvent; siblings: CalendarEvent[]; recId?: string } | null>(null);
  const [calView, setCalView] = useState<{ year: number; month: number } | null>(null);
  const [calSlideDir, setCalSlideDir] = useState<'left' | 'right' | null>(null);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [worshipWeekOffset, setWorshipWeekOffset] = useState<number>(0);
  const [editScope, setEditScope] = useState<'all' | 'one'>('all');
  const [editChoiceModal, setEditChoiceModal] = useState<{ target: CalendarEvent; siblings: CalendarEvent[] } | null>(null);
  const [eventScope, setEventScope] = useState<'community' | 'personal' | 'worship'>('community');
  const [eventCategories, setEventCategories] = useState<string[]>(['일반예배', '특별예배', '행사', '기념일']);
  const [eventCategory, setEventCategory] = useState<string>('행사');
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  useEffect(() => {
    fetch('/api/event-categories').then((r) => r.json()).then((d) => {
      if (Array.isArray(d?.categories) && d.categories.length) setEventCategories(d.categories);
    }).catch(() => {});
  }, []);
  const addEventCategory = async () => {
    const name = newCategoryInput.trim();
    if (!name) return;
    try {
      const r = await fetch('/api/event-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const d = await r.json();
      if (r.ok && Array.isArray(d.categories)) { setEventCategories(d.categories); setNewCategoryInput(''); }
      else if (d?.error) alert(d.error);
    } catch { alert('추가에 실패했습니다.'); }
  };
  const deleteEventCategory = async (name: string) => {
    if (!confirm(`"${name}" 구분을 삭제하시겠습니까?`)) return;
    try {
      const r = await fetch(`/api/event-categories?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      const d = await r.json();
      if (r.ok && Array.isArray(d.categories)) {
        setEventCategories(d.categories);
        if (eventCategory === name) setEventCategory(d.categories[0] || '');
      }
    } catch { alert('삭제에 실패했습니다.'); }
  };
  const [worshipTitleCustom, setWorshipTitleCustom] = useState(false);
  const [worshipTemplateId, setWorshipTemplateId] = useState<string>('');
  const [eventShared, setEventShared] = useState<boolean>(false);
  const [recurType, setRecurType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('none');
  const [recurInterval, setRecurInterval] = useState<number>(2);
  const [recurUnit, setRecurUnit] = useState<'week' | 'month' | 'year'>('week');
  const [recurDays, setRecurDays] = useState<number[]>([]);
  const [recurWeeks, setRecurWeeks] = useState<number[]>([]);
  const [recurMonths, setRecurMonths] = useState<number[]>([]);
  const [recurEndType, setRecurEndType] = useState<'count' | 'until'>('count');
  const [recurCount, setRecurCount] = useState<number>(10);
  const [recurUntil, setRecurUntil] = useState<string>('');
  const currentUserName = userEntries[0]?.realName || userEntries[0]?.nickname || '';
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<'구성원 관리' | '큐티관리' | '일정관리' | '예배관리' | '소모임관리' | '기타설정'>(
    typeof mgmtRouter.query.menu === 'string' && ['구성원 관리', '큐티관리', '일정관리', '예배관리', '소모임관리', '기타설정'].includes(mgmtRouter.query.menu)
      ? (mgmtRouter.query.menu as any)
      : '구성원 관리'
  );

  const [calCommunityId, setCalCommunityId] = useState<string>('');
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [calForm, setCalForm] = useState({ title: '', startAt: '', endAt: '', location: '', description: '' });
  const [calAllDay, setCalAllDay] = useState(false);
  const [locationMode, setLocationMode] = useState<'select' | 'custom'>('select');
  const [venueList, setVenueList] = useState<Array<{ id: string; floor: string; name: string; code: string }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/venues');
        if (res.ok) {
          const d = await res.json();
          setVenueList(Array.isArray(d.venues) ? d.venues : []);
        }
      } catch {}
    })();
  }, []);
  const [calSaving, setCalSaving] = useState(false);
  const [calMsg, setCalMsg] = useState<string | null>(null);

  useEffect(() => {
    if (scopedAdminCommunities.length > 0 && calCommunityId !== scopedAdminCommunities[0].id) {
      setCalCommunityId(scopedAdminCommunities[0].id);
    } else if (scopedAdminCommunities.length === 0 && mgmtCommunityId && calCommunityId !== mgmtCommunityId) {
      // 시스템 관리자가 adminCommunities에 없어도 mgmtCommunityId(URL)를 사용
      setCalCommunityId(mgmtCommunityId);
    }
  }, [scopedAdminCommunities, calCommunityId, mgmtCommunityId]);

  useEffect(() => {
    if (!calCommunityId) { setCalEvents([]); return; }
    let cancelled = false;
    // 월달력(calView)과 주별표(worshipWeekOffset)는 독립 스크롤.
    // 두 뷰가 먼 달(예: 2026-04 vs 2030-06)에 있을 때 union 범위로 fetch 하면 수년치를 한 번에 가져오므로
    // 각 뷰에 맞는 **좁은 윈도우 2개**를 병렬 fetch 후 id 기준 dedup 해서 merge.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmtKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    // 월달력 윈도우: viewMonth ± 1개월
    const viewYear = calView ? calView.year : now.getFullYear();
    const viewMonth = calView ? calView.month : now.getMonth() + 1;
    const monthFrom = fmtKey(new Date(viewYear, viewMonth - 2, 1));
    const monthTo = fmtKey(new Date(viewYear, viewMonth + 1, 0));

    // 주별표 윈도우: 해당 주가 속한 달 ± 1주 (작게)
    const dowToday = now.getDay();
    const mondayDelta = dowToday === 0 ? -6 : 1 - dowToday;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayDelta + worshipWeekOffset * 7);
    const weekFrom = fmtKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7));
    const weekTo = fmtKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 14));

    const makeUrl = (from: string, to: string) => {
      const qs = new URLSearchParams({ communityId: calCommunityId, type: 'event', from, to });
      if (profileId) qs.set('profileId', profileId);
      return `/api/events?${qs.toString()}`;
    };

    // 두 윈도우가 겹치면 한 번만, 아니면 둘 다 병렬로 호출
    const monthFromT = new Date(monthFrom).getTime();
    const monthToT = new Date(monthTo).getTime();
    const weekFromT = new Date(weekFrom).getTime();
    const weekToT = new Date(weekTo).getTime();
    const overlaps = weekFromT <= monthToT && weekToT >= monthFromT;
    const calls = overlaps
      ? [makeUrl(fmtKey(new Date(Math.min(monthFromT, weekFromT))), fmtKey(new Date(Math.max(monthToT, weekToT))))]
      : [makeUrl(monthFrom, monthTo), makeUrl(weekFrom, weekTo)];

    Promise.all(calls.map((u) => fetch(u).then((r) => r.json()).catch(() => ({ events: [] }))))
      .then((results) => {
        if (cancelled) return;
        const byId = new Map<string, any>();
        for (const res of results) {
          for (const ev of (res.events || [])) {
            if (ev && ev.id) byId.set(ev.id, ev);
          }
        }
        setCalEvents(Array.from(byId.values()));
      });
    return () => { cancelled = true; };
  }, [calCommunityId, profileId, calView?.year, calView?.month, worshipWeekOffset]);

  // Auto-update count/until when startAt changes while recurring (worship: 3mo horizon, community: 12mo)
  useEffect(() => {
    const horizonMonths = eventScope === 'worship' ? 3 : eventScope === 'community' ? 12 : 0;
    if (horizonMonths === 0 || recurType === 'none' || !calForm.startAt) return;
    const startDate = new Date(calForm.startAt);
    const horizon = new Date(startDate);
    horizon.setMonth(horizon.getMonth() + horizonMonths);
    const pad = (n: number) => String(n).padStart(2, '0');
    const untilStr = `${horizon.getFullYear()}-${pad(horizon.getMonth() + 1)}-${pad(horizon.getDate())}`;
    setRecurUntil(untilStr);
    // 새 일정 등록 시 반복 기본 횟수 = 5
    if (!editingEventId) setRecurCount(5);
  }, [eventScope, recurType, calForm.startAt, recurWeeks.length, editingEventId]);

  const createCalEvent = async () => {
    if (!profileId) { setCalMsg('로그인이 필요합니다.'); return; }
    const targetCommunityId = calCommunityId || mgmtCommunityId || '';
    if (!targetCommunityId) { setCalMsg('공동체가 선택되지 않았습니다.'); return; }
    const needsEnd = eventScope !== 'worship';
    if (!calForm.title || !calForm.startAt || (needsEnd && !calForm.endAt)) {
      return;
    }
    if (recurType !== 'none' && recurEndType === 'until') {
      if (!recurUntil) { setCalMsg('반복 종료 날짜를 선택해주세요.'); return; }
      const startD = new Date(calForm.startAt);
      const untilD = new Date(`${recurUntil}T23:59:59`);
      if (untilD.getTime() < startD.getTime()) {
        setCalMsg(`반복 종료일(${recurUntil})이 시작일(${calForm.startAt.slice(0, 10)})보다 빠릅니다. 연도를 확인해주세요.`);
        return;
      }
    }
    setCalSaving(true);
    setCalMsg(null);
    try {
      // 주의: 반복 예배는 이제 events.json에 단일 row + rule 로 저장. 루프 금지.
      // 아래 공통 events.json POST 경로를 통해 처리됨 (scope=worship).
      // worship은 endAt이 form에 없으므로 start+1h 기본값 사용
      // 저장은 항상 SG 벽시계 시각을 +08:00 으로 강제 인코딩 (관리자 브라우저 TZ 무관).
      const toSGIso = (local: string) => new Date(`${local}:00+08:00`).toISOString();
      const startIso = toSGIso(calForm.startAt);
      const endIso = calForm.endAt
        ? toSGIso(calForm.endAt)
        : new Date(new Date(`${calForm.startAt}:00+08:00`).getTime() + 60 * 60 * 1000).toISOString();

      // "이 회차만 수정": PATCH overrides 로 처리하고 종료
      if (editingEventId && editScope === 'one') {
        const original = calEvents.find((e) => e.id === editingEventId);
        const seriesId = (original as any)?.seriesId || editingEventId;
        const occurrenceDate = (original as any)?.dateKey || '';
        const patchRes = await fetch('/api/events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seriesId,
            occurrenceDate,
            profileId,
            fields: {
              title: calForm.title,
              startAt: startIso,
              endAt: endIso,
              location: calForm.location || undefined,
              description: calForm.description || undefined,
            },
          }),
        });
        if (!patchRes.ok) { const j = await patchRes.json().catch(() => ({})); setCalMsg(j.error || '수정 실패'); return; }
        try {
          const now2 = new Date();
          const vy = calView ? calView.year : now2.getFullYear();
          const vm = calView ? calView.month : now2.getMonth() + 1;
          const fr = new Date(vy, vm - 2, 1);
          const toD = new Date(vy, vm + 1, 0, 23, 59, 59);
          const p2 = (n: number) => String(n).padStart(2, '0');
          const qs = new URLSearchParams({ communityId: targetCommunityId, type: 'event', from: `${fr.getFullYear()}-${p2(fr.getMonth() + 1)}-${p2(fr.getDate())}`, to: `${toD.getFullYear()}-${p2(toD.getMonth() + 1)}-${p2(toD.getDate())}` });
          if (profileId) qs.set('profileId', profileId);
          const r = await fetch(`/api/events?${qs.toString()}`);
          if (r.ok) { const d = await r.json(); setCalEvents(d.events || []); }
        } catch {}
        setCalForm({ title: '', startAt: '', endAt: '', location: '', description: '' });
        setEditingEventId(null);
        setEditScope('all');
        setCalMsg('이 회차만 수정되었습니다.');
        setEventModalOpen(false);
        return;
      }

      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: targetCommunityId,
          profileId,
          title: calForm.title,
          startAt: startIso,
          endAt: endIso,
          location: calForm.location || undefined,
          description: calForm.description || undefined,
          scope: eventScope,
          shared: eventShared,
          category: eventCategory,
          createdByName: currentUserName,
          recurrence: recurType === 'none' ? null : {
            freq: recurType === 'custom' ? recurUnit : recurType,
            interval: 1,
            endType: recurEndType,
            count: recurEndType === 'count' ? recurCount : undefined,
            until: recurEndType === 'until' ? recurUntil : undefined,
            byDay: recurType === 'custom' && recurUnit === 'week' && recurDays.length > 0
              ? recurDays
              : (recurType === 'custom' && recurUnit === 'month' && recurWeeks.length > 0 && calForm.startAt
                ? [new Date(calForm.startAt).getDay()]
                : undefined),
            byWeek: recurType === 'custom' && recurUnit === 'month' && recurWeeks.length > 0 ? recurWeeks : undefined,
            byMonth: recurType === 'custom' && recurUnit === 'year' && recurMonths.length > 0 ? recurMonths : undefined,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) { setCalMsg(data.error || '등록 실패'); return; }
      // If editing, delete the original series (rule-based: 하나의 row가 전체 시리즈)
      if (editingEventId) {
        const original = calEvents.find((e) => e.id === editingEventId);
        const seriesId = (original as any)?.seriesId || editingEventId;
        await fetch(`/api/events?id=${encodeURIComponent(seriesId)}&profileId=${encodeURIComponent(profileId)}&scope=all`, { method: 'DELETE' });
        setCalEvents((prev) => prev.filter((e) => ((e as any).seriesId || e.id) !== seriesId));
        setEditingEventId(null);
      }
      // 반복 rule row는 서버에서 펼쳐야 캘린더에 보이므로 재조회
      try {
        const now3 = new Date();
        const vy3 = calView ? calView.year : now3.getFullYear();
        const vm3 = calView ? calView.month : now3.getMonth() + 1;
        const fr3 = new Date(vy3, vm3 - 2, 1);
        const toD3 = new Date(vy3, vm3 + 1, 0, 23, 59, 59);
        const p3 = (n: number) => String(n).padStart(2, '0');
        const qs = new URLSearchParams({ communityId: targetCommunityId, type: 'event', from: `${fr3.getFullYear()}-${p3(fr3.getMonth() + 1)}-${p3(fr3.getDate())}`, to: `${toD3.getFullYear()}-${p3(toD3.getMonth() + 1)}-${p3(toD3.getDate())}` });
        if (profileId) qs.set('profileId', profileId);
        const r = await fetch(`/api/events?${qs.toString()}`);
        if (r.ok) {
          const d = await r.json();
          setCalEvents(d.events || []);
        }
      } catch {}
      setCalForm({ title: '', startAt: '', endAt: '', location: '', description: '' });
      setCalMsg(editingEventId ? '수정되었습니다.' : '등록되었습니다.');
      setEventModalOpen(false);
    } catch (e) {
      setCalMsg('등록 중 오류');
      console.error(e);
    } finally {
      setCalSaving(false);
    }
  };

  const deleteCalEvent = async (id: string) => {
    if (!profileId) return;
    // Check if it's a worship service (pseudo-event merged from worship-services)
    const worshipTarget = worshipServices.find((s) => s.id === id);
    if (worshipTarget) {
      if ((worshipTarget as any).isDefault) { window.alert('기본 템플릿은 삭제할 수 없습니다.'); return; }
      // Detect siblings by recurrenceId (primary) or createdAt proximity (fallback for legacy data)
      const cid = (worshipTarget as any).communityId || calCommunityId || mgmtCommunityId || '';
      const recId = (worshipTarget as any).recurrenceId;
      let siblings: any[] = [];
      if (recId) {
        siblings = worshipServices.filter((s) => s.id !== worshipTarget.id && (s as any).recurrenceId === recId && !(s as any).isDefault);
      } else if ((worshipTarget as any).createdAt) {
        const tCreated = new Date((worshipTarget as any).createdAt).getTime();
        siblings = worshipServices.filter((s) => {
          if (s.id === worshipTarget.id) return false;
          if ((s as any).isDefault) return false;
          if (s.name !== worshipTarget.name) return false;
          const sCreated = (s as any).createdAt ? new Date((s as any).createdAt).getTime() : 0;
          return Math.abs(sCreated - tCreated) < 30_000; // same batch: within 30 seconds
        });
      }
      if (siblings.length > 0) {
        // Show series-delete modal (pretend it's a CalendarEvent so the existing UI works)
        const pseudoTarget: any = { ...worshipTarget, title: worshipTarget.name, endAt: worshipTarget.startAt, scope: 'worship', _isWorshipService: true, communityId: cid };
        const pseudoSiblings: any[] = siblings.map((s) => ({ ...s, title: s.name, endAt: s.startAt, scope: 'worship', _isWorshipService: true, communityId: cid }));
        setDeleteModal({ target: pseudoTarget, siblings: pseudoSiblings, recId: undefined });
        return;
      }
      if (!window.confirm('이 예배를 삭제할까요?')) return;
      if (!cid) return;
      const res = await fetch(`/api/communities/${encodeURIComponent(cid)}/worship-services?serviceId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) setWorshipServices((prev) => prev.filter((s) => s.id !== id));
      else { const j = await res.json().catch(() => ({})); window.alert(j.error || '삭제 실패'); }
      return;
    }
    const target = calEvents.find((e) => e.id === id);
    if (!target) return;
    const seriesId = (target as any).seriesId || target.id;
    // rule 기반 시리즈인지 판단: 같은 seriesId를 가진 형제 occurrence가 있으면 시리즈
    const siblings: CalendarEvent[] = calEvents.filter((e) => e.id !== target.id && ((e as any).seriesId || e.id) === seriesId);
    const recId = seriesId;
    if (siblings.length > 0) {
      setDeleteModal({ target, siblings, recId });
      return;
    }

    if (!window.confirm('일정을 삭제할까요?')) return;
    const response = await fetch(`/api/events?id=${encodeURIComponent(seriesId)}&profileId=${encodeURIComponent(profileId)}&scope=all`, { method: 'DELETE' });
    if (response.ok) setCalEvents((prev) => prev.filter((e) => ((e as any).seriesId || e.id) !== seriesId));
  };

  const applyRuleToForm = (rule: any) => {
    if (!rule || !rule.freq) { setRecurType('none'); return; }
    const freqMap: Record<string, 'daily' | 'weekly' | 'monthly' | 'yearly'> = {
      daily: 'daily', day: 'daily',
      weekly: 'weekly', week: 'weekly',
      monthly: 'monthly', month: 'monthly',
      yearly: 'yearly', year: 'yearly',
    };
    const mapped = freqMap[rule.freq] || 'weekly';
    setRecurType(mapped);
    if (rule.until) { setRecurEndType('until'); setRecurUntil(String(rule.until).slice(0, 10)); }
    else if (typeof rule.count === 'number' && rule.count > 0) { setRecurEndType('count'); setRecurCount(rule.count); }
  };

  const beginEditWithScope = (scope: 'one' | 'all') => {
    if (!editChoiceModal) return;
    const ev = editChoiceModal.target;
    const toLocal = (iso: string) => {
      const d = new Date(iso);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    };
    setEventScope((ev.scope as any) || 'community');
    setEventShared(!!(ev as any).shared);
    setCalForm({ title: ev.title, startAt: toLocal(ev.startAt), endAt: toLocal(ev.endAt), location: ev.location || '', description: ev.description || '' });
    if (scope === 'all') {
      applyRuleToForm((ev as any).rule);
    } else {
      // 이 회차만: 반복 설정 잠금
      setRecurType('none');
    }
    setEditingEventId(ev.id);
    setEditScope(scope);
    setEditChoiceModal(null);
    setEventModalOpen(true);
  };

  const performSeriesDelete = async (scope: 'one' | 'all') => {
    if (!deleteModal || !profileId) return;
    const { target, siblings, recId } = deleteModal;
    // Worship service branch — also clean up matching events in events.json (legacy dual-storage)
    if ((target as any)._isWorshipService) {
      const cid = (target as any).communityId || calCommunityId || mgmtCommunityId;
      if (!cid) { setDeleteModal(null); return; }
      const targets = scope === 'all' ? [target, ...siblings] : [target];
      const wsResults = await Promise.all(targets.map((t) =>
        fetch(`/api/communities/${encodeURIComponent(cid)}/worship-services?serviceId=${encodeURIComponent(t.id)}`, { method: 'DELETE' }),
      ));
      const okIds = targets.filter((_, i) => wsResults[i].ok).map((t) => t.id);
      setWorshipServices((prev) => prev.filter((s) => !okIds.includes(s.id)));
      // Also delete any matching events in events.json (same date + same title + scope=worship)
      const toDeleteEvents = calEvents.filter((e) => (e as any).scope === 'worship' && targets.some((t) =>
        e.title === t.title && new Date(e.startAt).toDateString() === new Date((t as any).startAt).toDateString()
      ));
      if (toDeleteEvents.length > 0 && profileId) {
        await Promise.all(toDeleteEvents.map((e) =>
          fetch(`/api/events?id=${encodeURIComponent(e.id)}&profileId=${encodeURIComponent(profileId)}&scope=one`, { method: 'DELETE' })
        ));
        setCalEvents((prev) => prev.filter((e) => !toDeleteEvents.some((d) => d.id === e.id)));
      }
      setDeleteModal(null);
      return;
    }
    const seriesId = (target as any).seriesId || target.id;
    const occurrenceDate = (target as any).dateKey || '';
    if (scope === 'all') {
      // 시리즈 전체 삭제
      const response = await fetch(`/api/events?id=${encodeURIComponent(seriesId)}&profileId=${encodeURIComponent(profileId)}&scope=all`, { method: 'DELETE' });
      if (response.ok) setCalEvents((prev) => prev.filter((e) => ((e as any).seriesId || e.id) !== seriesId));
    } else {
      // 해당 회차만 삭제 (override로 cancelled 추가)
      const qs = new URLSearchParams({ id: seriesId, profileId, scope: 'one' });
      if (occurrenceDate) qs.set('occurrenceDate', occurrenceDate);
      const response = await fetch(`/api/events?${qs.toString()}`, { method: 'DELETE' });
      if (response.ok) setCalEvents((prev) => prev.filter((e) => e.id !== target.id));
    }
    setDeleteModal(null);
  };

  useEffect(() => {
    const initialSettings: Record<string, 'auto' | 'admin'> = {};
    const initialRealName: Record<string, boolean> = {};
    const initialTz: Record<string, string> = {};
    adminCommunities.forEach((community) => {
      initialSettings[community.id] = community.joinApprovalMode || 'auto';
      initialRealName[community.id] = community.requireRealName !== false;
      initialTz[community.id] = community.timezone || 'Asia/Seoul';
    });
    setSettings(initialSettings);
    setRealNameSettings(initialRealName);
    setTzSettings(initialTz);
  }, [adminCommunities]);

  const handleSettingChange = (communityId: string, value: 'auto' | 'admin') => {
    setSettings((current) => ({ ...current, [communityId]: value }));
  };

  const handleRealNameChange = (communityId: string, value: boolean) => {
    setRealNameSettings((current) => ({ ...current, [communityId]: value }));
  };

  const loadMembers = async () => {
    if (!profileId || !mgmtCommunityId) return;
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/community-members?communityId=${encodeURIComponent(mgmtCommunityId)}&profileId=${encodeURIComponent(profileId)}`);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      setMembers(data.members || []);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (activeMenu === '구성원 관리') loadMembers();
  }, [activeMenu, mgmtCommunityId, profileId]);

  const handleTzChange = (communityId: string, value: string) => {
    setTzSettings((cur) => ({ ...cur, [communityId]: value }));
  };

  const loadWorshipServices = async () => {
    const cid = mgmtCommunityId || calCommunityId;
    if (!cid) { setWorshipServices([]); return; }
    try {
      const res = await fetch(`/api/communities/${encodeURIComponent(cid)}/worship-services`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setWorshipServices(d.services || []);
    } catch { setWorshipServices([]); }
  };

  const createWorshipService = async () => {
    if (!profileId || !mgmtCommunityId) { setWsMsg('공동체가 선택되지 않았습니다.'); return; }
    if (!wsForm.name.trim() || !wsForm.startAt) { setWsMsg('예배이름과 일시는 필수입니다.'); return; }
    setWsCreating(true);
    setWsMsg(null);
    try {
      const unit = wsRecurType === 'custom' ? wsRecurUnit : wsRecurType;
      const dates: Date[] = [];
      const start = new Date(wsForm.startAt);
      if (wsRecurType === 'none') {
        dates.push(start);
      } else {
        const maxCount = unit === 'daily' || unit === 'day' ? 365 : unit === 'weekly' || unit === 'week' ? 52 : 12;
        const oneYearLater = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate(), start.getHours(), start.getMinutes());
        const limit = wsRecurEndType === 'count' ? Math.min(wsRecurCount, maxCount)
          : wsRecurUntil ? maxCount
          : maxCount;
        const untilTs = wsRecurEndType === 'until' && wsRecurUntil ? Math.min(new Date(`${wsRecurUntil}T23:59:59`).getTime(), oneYearLater.getTime()) : oneYearLater.getTime();
        const cur = new Date(start);
        for (let i = 0; i < limit; i++) {
          if (cur.getTime() > untilTs) break;
          dates.push(new Date(cur));
          if (unit === 'daily' || unit === 'day') cur.setDate(cur.getDate() + 1);
          else if (unit === 'weekly' || unit === 'week') cur.setDate(cur.getDate() + 7);
          else if (unit === 'monthly' || unit === 'month') cur.setMonth(cur.getMonth() + 1);
        }
      }

      const MAX_RECURRENCE_COUNT = 52;
      const cappedDates = dates.slice(0, MAX_RECURRENCE_COUNT);
      const recurrenceId = cappedDates.length > 1 ? `wrec-${Date.now()}-${Math.floor(Math.random() * 10000)}` : undefined;
      let created = 0;
      let lastError: string | null = null;
      for (const d of cappedDates) {
        const body: any = {
          name: wsForm.name,
          startAt: d.toISOString(),
          profileId,
        };
        if (worshipTemplateId) {
          body.bulletinTemplateId = worshipTemplateId;
        } else if (wsForm.generateBulletin) {
          body.generateBulletin = true;
        }
        if (recurrenceId) body.recurrenceId = recurrenceId;
        const res = await fetch(`/api/communities/${encodeURIComponent(mgmtCommunityId)}/worship-services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) created++;
        else { const j = await res.json().catch(() => ({})); lastError = j.error || '생성 실패'; }
      }
      if (created === 0) { setWsMsg(lastError || '생성 실패'); return; }
      setWsMsg(`${created}개 예배가 등록되었습니다.`);
      setWsForm({ name: '주일예배', startAt: '', generateBulletin: true, location: '' });
      await loadWorshipServices();
      setWsModalOpen(false);
    } catch {
      setWsMsg('생성 중 오류');
    } finally {
      setWsCreating(false);
    }
  };

  const deleteWorshipService = async (id: string) => {
    // Delegate to the unified event delete flow so siblings modal works
    await deleteCalEvent(id);
  };

  const toggleBulletinUsage = async (svc: WorshipService, use: boolean) => {
    const cid = mgmtCommunityId || calCommunityId;
    if (!cid) return;
    const body: any = { serviceId: svc.id };
    if (use) {
      // Materialize now: use resolvedBulletin (carry-forward) or default template
      const defaultSvc = worshipServices.find((s) => (s as any).isDefault);
      const source = svc.resolvedBulletin || defaultSvc?.bulletin || null;
      body.bulletin = source ? JSON.parse(JSON.stringify(source)) : { design: {}, content: {} };
    } else {
      body.bulletinTemplateId = null;
      body.bulletin = null;
    }
    try {
      const res = await fetch(`/api/communities/${encodeURIComponent(cid)}/worship-services`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('변경 실패');
      await loadWorshipServices();
    } catch (e: any) {
      window.alert(e?.message || '변경 실패');
    }
  };

  const [duplicateSource, setDuplicateSource] = useState<WorshipService | null>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateSaving, setDuplicateSaving] = useState(false);
  const submitDuplicate = async () => {
    if (!mgmtCommunityId || !duplicateSource) return;
    const name = duplicateName.trim();
    if (!name) { window.alert('템플릿 이름을 입력하세요.'); return; }
    setDuplicateSaving(true);
    try {
      const res = await fetch(`/api/communities/${encodeURIComponent(mgmtCommunityId)}/worship-services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, duplicateFromId: duplicateSource.id, profileId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || '복제에 실패했습니다.'); }
      const d = await res.json();
      if (d.service) setWorshipServices((prev) => [d.service, ...prev]);
      setDuplicateSource(null);
      setDuplicateName('');
    } catch (e: any) {
      window.alert(e?.message || '복제 실패');
    } finally {
      setDuplicateSaving(false);
    }
  };

  useEffect(() => {
    if (activeMenu === '예배관리' || activeMenu === '일정관리') loadWorshipServices();
  }, [activeMenu, mgmtCommunityId, calCommunityId]);

  useEffect(() => {
    const cid = mgmtCommunityId || calCommunityId;
    if (!cid || activeMenu !== '예배관리') return;
    fetch(`/api/communities/${encodeURIComponent(cid)}/design`)
      .then((r) => r.json())
      .then((d) => {
        if (d.design) setCommunityDesign((prev: any) => ({ ...prev, ...d.design }));
        if (d.content) setCommunityContent(d.content);
      })
      .catch(() => {});
  }, [mgmtCommunityId, calCommunityId, activeMenu]);

  const saveCommunityDesign = async (propagate: boolean) => {
    const cid = mgmtCommunityId || calCommunityId;
    if (!cid || !profileId) return;
    setDesignSaving(true);
    setDesignMsg(null);
    try {
      const res = await fetch(`/api/communities/${encodeURIComponent(cid)}/design`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, design: communityDesign }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || '저장 실패'); }
      if (propagate) {
        const updated: any[] = [];
        for (const svc of worshipServices) {
          if (!svc.bulletin) continue;
          const cur: any = svc.bulletin;
          const merged = cur.design || cur.content
            ? { ...cur, design: { ...(cur.design || {}), ...communityDesign } }
            : { design: communityDesign, content: { ...cur } };
          const r = await fetch(`/api/communities/${encodeURIComponent(cid)}/worship-services`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceId: svc.id, bulletin: merged }),
          });
          if (r.ok) { const d = await r.json(); updated.push(d.service); }
        }
        if (updated.length > 0) {
          setWorshipServices((prev) => prev.map((s) => updated.find((x) => x.id === s.id) || s));
        }
        setDesignMsg(`디자인 저장됨. ${updated.length}개 예배에 적용되었습니다.`);
      } else {
        setDesignMsg('디자인이 저장되었습니다.');
      }
    } catch (e: any) {
      setDesignMsg(e?.message || '저장 실패');
    } finally {
      setDesignSaving(false);
    }
  };

  const saveTimezone = async (communityId: string) => {
    const timezone = tzSettings[communityId];
    if (!timezone) return;
    setSavingTzId(communityId);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, timezone }),
      });
      const data = await response.json();
      if (!response.ok) setStatusMessage(data.error || '저장에 실패했습니다.');
      else setStatusMessage('타임존이 저장되었습니다.');
    } catch {
      setStatusMessage('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingTzId(null);
    }
  };

  const saveRealName = async (communityId: string) => {
    const requireRealName = realNameSettings[communityId];
    setSavingRealNameId(communityId);
    setStatusMessage(null);
    try {
      const response = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, requireRealName }),
      });
      const data = await response.json();
      if (!response.ok) setStatusMessage(data.error || '저장에 실패했습니다.');
      else setStatusMessage('실명사용 설정이 저장되었습니다.');
    } catch (e) {
      setStatusMessage('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingRealNameId(null);
    }
  };

  const saveSettings = async (communityId: string) => {
    const joinApprovalMode = settings[communityId];
    if (!joinApprovalMode) return;

    setSavingCommunityId(communityId);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, joinApprovalMode }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatusMessage(data.error || '설정 저장에 실패했습니다.');
      } else {
        setStatusMessage('관리 설정이 저장되었습니다.');
      }
    } catch (error) {
      setStatusMessage('설정 저장 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setSavingCommunityId(null);
    }
  };

  return (
    <>
      <Head>
        <title>KCIS | 관리 메뉴</title>
        <meta name="description" content="관리 메뉴에서 큐티, 일정, 소모임, 기타 설정을 할 수 있습니다." />
      </Head>

      <AppShell
        profileId={profileId}
        displayName={userEntries[0]?.realName || userEntries[0]?.nickname || null}
        nickname={userEntries[0]?.nickname || null}
        email={userEntries[0]?.profile?.kakao_account?.email || null}
        isAdmin={scopedAdminCommunities.length > 0}
        adminAccent={!!systemAdminHref}
        systemAdminHref={systemAdminHref || undefined}
        showMenuBar={false}
        brandExtras={mgmtCommunityId ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <CommunityBadge profileId={profileId} communityId={mgmtCommunityId} joinedCommunities={joinedCommunities} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 6 15 12 9 18" />
              </svg>
              <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--color-primary-deep)' }}>공동체 관리</span>
            </span>
          </div>
        ) : undefined}
      >

          {systemAdminHref && (() => {
            const k = typeof mgmtRouter.query.k === 'string' ? mgmtRouter.query.k : '';
            const myNicknameQ = typeof mgmtRouter.query.nickname === 'string' ? mgmtRouter.query.nickname : '';
            const myEmailQ = typeof mgmtRouter.query.email === 'string' ? mgmtRouter.query.email : '';
            const adminQS = new URLSearchParams({ profileId, ...(k ? { k } : {}), ...(myNicknameQ ? { nickname: myNicknameQ } : {}), ...(myEmailQ ? { email: myEmailQ } : {}) }).toString();
            return (
              <AdminTabBar authQS={adminQS} />
            );
          })()}

          <section style={{ display: 'grid', gap: '1rem' }}>
            {!systemAdminHref && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {(['구성원 관리', '일정관리', '예배관리', '소모임관리', '기타설정', '큐티관리'] as const).map((item) => {
                  const active = activeMenu === item;
                  const isQt = item === '큐티관리';
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={active}
                      style={{
                        minHeight: 40,
                        padding: '0 0.9rem',
                        borderRadius: 10,
                        border: active ? '2px solid var(--color-primary)' : '1px solid var(--color-gray)',
                        background: active ? 'var(--color-primary-tint)' : 'var(--color-surface)',
                        color: isQt ? '#9ca3af' : active ? 'var(--color-primary-deep)' : 'var(--color-ink)',
                        fontStyle: isQt ? 'italic' : 'normal',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      onClick={() => setActiveMenu(item)}
                    >
                      {item === '일정관리' ? '일정관리' : item === '예배관리' ? '주보' : item === '소모임관리' ? '셀모임관리' : item === '구성원 관리' ? '출첵' : item}
                    </button>
                  );
                })}
              </div>
            )}

            {activeMenu === '구성원 관리' && (() => {
              const activeMembers = members.filter((m) => (m.membershipStatus || 'active') === 'active');
              const list = activeMembers;
              return (
                <section style={{ padding: isMobile ? '1rem' : '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
                  <h2 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.2rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>구성원 관리 ({activeMembers.length})</h2>
                  {!mgmtCommunityId ? (
                    <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>공동체를 선택해주세요.</p>
                  ) : (
                    <>
                      {membersLoading ? (
                        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
                      ) : list.length === 0 ? (
                        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>구성원이 없습니다.</p>
                      ) : (
                        <div className="responsive-x-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                          <table style={{ width: '100%', minWidth: isMobile ? 520 : undefined, borderCollapse: 'collapse', fontSize: isMobile ? '0.82rem' : '0.88rem' }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9', color: 'var(--color-ink-2)', textAlign: 'left' }}>
                                <th style={{ padding: '0.6rem 0.75rem', fontWeight: 700, borderBottom: '1px solid var(--color-gray)', width: 40 }}>#</th>
                                <th style={{ padding: '0.6rem 0.75rem', fontWeight: 700, borderBottom: '1px solid var(--color-gray)' }}>이름</th>
                                <th style={{ padding: '0.6rem 0.75rem', fontWeight: 700, borderBottom: '1px solid var(--color-gray)' }}>이메일</th>
                                <th style={{ padding: '0.6rem 0.75rem', fontWeight: 700, borderBottom: '1px solid var(--color-gray)', whiteSpace: 'nowrap' }}>제공자</th>
                                <th style={{ padding: '0.6rem 0.75rem', fontWeight: 700, borderBottom: '1px solid var(--color-gray)', whiteSpace: 'nowrap' }}>등록일</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.map((m, idx) => (
                                <tr key={m.userId} style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                                  <td style={{ padding: '0.65rem 0.75rem', color: 'var(--color-ink-2)', fontWeight: 600, textAlign: 'center' }}>{idx + 1}</td>
                                  <td style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}>{m.realName || m.nickname || m.providerProfileId}</td>
                                  <td style={{ padding: '0.65rem 0.75rem', color: 'var(--color-ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{m.profile?.kakao_account?.email || '-'}</td>
                                  <td style={{ padding: '0.65rem 0.75rem', color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{m.provider}</td>
                                  <td style={{ padding: '0.65rem 0.75rem', color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{m.registeredAt ? new Date(m.registeredAt).toLocaleDateString('ko-KR') : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </section>
              );
            })()}

            {activeMenu === '일정관리' && (() => {
              const community = adminCommunities.find((c) => c.id === calCommunityId);
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              const icsUrl = calCommunityId ? `${origin}/api/communities/${calCommunityId}/calendar` : '';
              const webcalUrl = icsUrl.replace(/^https?:/, 'webcal:');
              const gcalUrl = icsUrl ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(icsUrl)}` : '';

              // 일정 표시·버켓팅은 항상 SG(UTC+8) 기준. 브라우저 로컬 TZ 로 getDate()/getHours() 금지.
              // 서버는 SG 벽시계 시각을 +08:00 ISO로 저장하므로, 읽을 때도 SG 로 풀어야 같은 날짜가 나온다.
              const toKey = (d: Date): string => getSGDateKey(d.toISOString()) || '';
              const now = new Date();
              const todayKey = getSGTodayKey();
              const [tyStr, tmStr] = todayKey.split('-');
              const year = calView ? calView.year : Number(tyStr);
              const monthIdx = calView ? calView.month - 1 : Number(tmStr) - 1;
              const first = new Date(year, monthIdx, 1);
              const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
              const startOffset = first.getDay();
              const cells: Array<{ date: Date; key: string } | null> = [];
              for (let i = 0; i < startOffset; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) {
                const dt = new Date(year, monthIdx, d);
                cells.push({ date: dt, key: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
              }
              while (cells.length % 7 !== 0) cells.push(null);
              const eventsByDay = new Map<string, CalendarEvent[]>();
              calEvents.forEach((ev) => {
                const startKey = getSGDateKey(ev.startAt);
                const endKey = getSGDateKey(ev.endAt);
                if (!startKey || !endKey) return;
                // SG 문자열 day walk (로컬 TZ Date 연산 금지 — KST 사용자에서 하루씩 밀림 발생)
                let cursorKey = startKey;
                let safety = 0;
                while (cursorKey <= endKey && safety < 400) {
                  if (!eventsByDay.has(cursorKey)) eventsByDay.set(cursorKey, []);
                  eventsByDay.get(cursorKey)!.push(ev);
                  cursorKey = addDaysToKey(cursorKey, 1);
                  safety++;
                }
              });
              // Merge worship services as pseudo events so they show on this calendar too
              worshipServices.filter((s) => s.startAt && s.communityId === calCommunityId).forEach((s) => {
                const k = getSGDateKey(s.startAt);
                if (!k) return;
                const pseudo: any = {
                  id: s.id,
                  communityId: (s as any).communityId || calCommunityId,
                  title: s.name,
                  startAt: s.startAt,
                  endAt: s.startAt,
                  scope: 'worship',
                  _isWorshipService: true,
                };
                if (!eventsByDay.has(k)) eventsByDay.set(k, []);
                eventsByDay.get(k)!.push(pseudo);
              });
              const prevMonth = monthIdx === 0 ? 12 : monthIdx;
              const nextMonth = monthIdx === 11 ? 1 : monthIdx + 2;
              const goPrev = () => { setCalSlideDir('right'); setCalView({ year: monthIdx === 0 ? year - 1 : year, month: prevMonth }); };
              const goNext = () => { setCalSlideDir('left'); setCalView({ year: monthIdx === 11 ? year + 1 : year, month: nextMonth }); };
              const yearOptions: number[] = [];
              for (let y = year - 5; y <= year + 5; y++) yearOptions.push(y);

              // 예배/기도회 주간표: 월요일 기준 월~일 (worshipWeekOffset 만큼 주 이동)
              const [tY, tM, tD] = todayKey.split('-').map(Number);
              const todayLocal = new Date(tY, tM - 1, tD);
              const dowToday = todayLocal.getDay();  // 0=일 ~ 6=토
              // 월요일이 주 시작 → 오늘이 일요일(0)이면 -6, 월(1)이면 0, 화(2)면 -1, ...
              const mondayDelta = dowToday === 0 ? -6 : 1 - dowToday;
              const weekStartOffset = mondayDelta + worshipWeekOffset * 7;
              const weekDaysCal: Array<{ key: string; date: Date; events: any[] }> = [];
              for (let i = 0; i < 7; i++) {
                const d = new Date(tY, tM - 1, tD + weekStartOffset + i);
                const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                weekDaysCal.push({ key: k, date: d, events: eventsByDay.get(k) || [] });
              }
              const weekLabel = worshipWeekOffset === 0 ? '이번주' : worshipWeekOffset === -1 ? '지난주' : worshipWeekOffset === 1 ? '다음주' : (worshipWeekOffset > 0 ? `+${worshipWeekOffset}주` : `${worshipWeekOffset}주`);
              const weekRangeText = (() => {
                const s = weekDaysCal[0].date;
                const e = weekDaysCal[6].date;
                const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
                return `${fmt(s)} ~ ${fmt(e)}`;
              })();
              // 예배/기도회 상단 뱃지는 일반예배/기도회만
              const WORSHIP_CATS = ['일반예배', '기도회'];
              const isWorshipCat = (ev: any) => WORSHIP_CATS.includes(ev?.category);
              // 주간 카드에는 '예약' 제외한 모든 이벤트를 포함 (예배는 뱃지, 그 외는 bullet)
              const isReservation = (ev: any) => (ev?.type || 'event') === 'reservation';
              const weekWorship = weekDaysCal.map((d) => {
                const relevant = d.events.filter((ev: any) => !isReservation(ev));
                const worship = relevant.filter(isWorshipCat).sort((a: any, b: any) => (a.startAt || '').localeCompare(b.startAt || ''));
                const others = relevant.filter((ev: any) => !isWorshipCat(ev)).sort((a: any, b: any) => (a.startAt || '').localeCompare(b.startAt || ''));
                return { ...d, worship, others };
              });
              // 일반 일정 달력용: 예배 제외
              const eventsByDayNonWorship = new Map<string, any[]>();
              for (const [k, list] of eventsByDay.entries()) {
                const filtered = list.filter((e: any) => !isWorshipCat(e));
                if (filtered.length > 0) eventsByDayNonWorship.set(k, filtered);
              }
              // 카테고리별 색상 매핑은 lib/categoryColors.ts에서 일괄 관리
              const colorFor = categoryColorFor;

              return (
                <>
                <section style={{ padding: '1.25rem 1.5rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.75rem', order: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#3F6212', letterSpacing: '-0.01em', fontWeight: 800 }}>일정확인 <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>(주별 · {weekLabel})</span></h2>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ padding: '0.3rem 0.7rem', borderRadius: 999, background: '#ECFCCB', color: '#3F6212', fontSize: isMobile ? '0.88rem' : '0.95rem', fontWeight: 800, letterSpacing: '0.01em' }}>{weekRangeText}</span>
                      {worshipWeekOffset !== 0 && (
                        <button
                          type="button"
                          onClick={() => setWorshipWeekOffset(0)}
                          style={{ padding: '0.25rem 0.6rem', borderRadius: 999, border: '1px solid #65A30D', background: '#fff', color: '#65A30D', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}
                        >오늘</button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'stretch', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setWorshipWeekOffset((w) => w - 1)}
                      aria-label="이전주"
                      style={{ padding: '0 0.7rem', borderRadius: 10, border: '1px solid #D9F09E', background: '#fff', color: '#65A30D', fontSize: '1.2rem', fontWeight: 800, cursor: 'pointer' }}
                    >‹</button>
                    <div style={{ minWidth: 0 }}>
                      {/* 테이블은 아래에서 렌더 */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <colgroup>
                      <col style={{ width: '90px' }} />
                      <col />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.4rem 0.5rem', fontSize: '0.72rem', color: 'var(--color-ink-2)', fontWeight: 800, textAlign: 'center', borderBottom: '2px solid #ECFCCB' }}>날짜</th>
                        <th style={{ padding: '0.4rem 0.5rem', fontSize: '0.72rem', color: '#3F6212', fontWeight: 800, textAlign: 'left', borderBottom: '2px solid #ECFCCB' }}>일정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekWorship.map((d) => {
                        const dow = ['일','월','화','수','목','금','토'][d.date.getDay()];
                        const isToday = d.key === todayKey;
                        const worshipAll = d.worship.slice().sort((a: any, b: any) => (a.startAt || '').localeCompare(b.startAt || ''));
                        const othersAll = d.others.slice().sort((a: any, b: any) => (a.startAt || '').localeCompare(b.startAt || ''));
                        const badgePalette = (cat: string) => colorFor(cat);
                        const bulletColor = (cat?: string) => {
                          const c = colorFor(cat);
                          return c.fg;
                        };
                        // 캘린더의 수정 버튼은 "일정 수정" 모달만 연다.
                        // pseudo worship service(_isWorshipService) 는 events DB에 존재하지 않아 저장이 깨지므로
                        // 애초에 수정/삭제 버튼을 렌더하지 않고, 주보 편집은 예배일정 탭으로 분리.
                        const openEditForEvent = (ev: any) => {
                          const seriesId = ev.seriesId || ev.id;
                          const siblings = calEvents.filter((e) => e.id !== ev.id && ((e as any).seriesId || e.id) === seriesId);
                          const isSeries = siblings.length > 0 || !!ev.rule;
                          if (isSeries) {
                            setEditChoiceModal({ target: ev, siblings });
                            return;
                          }
                          const toLocal = (iso: string) => {
                            const d = new Date(iso);
                            const pad = (n: number) => String(n).padStart(2, '0');
                            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                          };
                          setEventScope((ev.scope as any) || 'community');
                          setEventShared(!!ev.shared);
                          setCalForm({ title: ev.title, startAt: toLocal(ev.startAt), endAt: toLocal(ev.endAt), location: ev.location || '', description: ev.description || '' });
                          setRecurType('none');
                          setEditingEventId(ev.id);
                          setEditScope('all');
                          setEventModalOpen(true);
                        };
                        const rowGridCols = '1fr auto auto';
                        const editBtnStyle: React.CSSProperties = { minHeight: 28, background: 'transparent', border: 'none', color: 'var(--color-primary-deep)', fontSize: '0.76rem', cursor: 'pointer', padding: '0 0.4rem', whiteSpace: 'nowrap', fontWeight: 700 };
                        const delBtnStyle: React.CSSProperties = { minHeight: 28, background: 'transparent', border: 'none', color: 'var(--color-danger)', fontSize: '0.76rem', cursor: 'pointer', padding: '0 0.4rem', whiteSpace: 'nowrap' };
                        const renderList = (wList: any[], oList: any[]) => {
                          if (wList.length === 0 && oList.length === 0) {
                            return <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>—</span>;
                          }
                          return (
                            <div style={{ display: 'grid', gap: '0.2rem' }}>
                              {wList.map((ev: any) => {
                                const pal = badgePalette(ev.category);
                                const isPseudo = !!ev._isWorshipService;
                                const cols = isPseudo ? '1fr' : rowGridCols;
                                return (
                                  <div key={ev.id + ev.startAt} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', lineHeight: 1.35 }}>
                                    <span title={ev.title} style={{ justifySelf: 'start', padding: '0.12rem 0.5rem', borderRadius: 999, background: pal.bg, border: `1px solid ${pal.border}`, color: pal.fg, fontSize: '0.72rem', fontWeight: 800, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                      {ev.title}
                                    </span>
                                    {!isPseudo && (
                                      <>
                                        <button type="button" aria-label={`${ev.title} 수정`} onClick={() => openEditForEvent(ev)} style={editBtnStyle}>수정</button>
                                        <button type="button" aria-label={`${ev.title} 삭제`} onClick={() => deleteCalEvent(ev.id)} style={delBtnStyle}>삭제</button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                              {oList.map((ev: any) => {
                                const allDay = isAllDayEvent(ev.startAt, ev.endAt);
                                const raw = new Date(ev.startAt);
                                const hour = raw.getHours();
                                const minute = raw.getMinutes();
                                const ampm = hour < 12 ? '오전' : '오후';
                                const h12 = ((hour + 11) % 12) + 1;
                                const timeLabel = allDay ? '종일' : `${ampm} ${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                                const dot = bulletColor(ev.category);
                                const isPseudo = !!ev._isWorshipService;
                                const cols = isPseudo ? '1fr' : rowGridCols;
                                return (
                                  <div key={ev.id + ev.startAt} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', lineHeight: 1.35 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem', minWidth: 0 }}>
                                      <span style={{ flex: '0 0 auto', width: 6, height: 6, borderRadius: 999, background: dot, alignSelf: 'center' }} />
                                      <span style={{ color: 'var(--color-ink-2)', fontWeight: 600, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{timeLabel}</span>
                                      <span style={{ color: 'var(--color-ink)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                                    </span>
                                    {!isPseudo && (
                                      <>
                                        <button type="button" aria-label={`${ev.title} 수정`} onClick={() => openEditForEvent(ev)} style={editBtnStyle}>수정</button>
                                        <button type="button" aria-label={`${ev.title} 삭제`} onClick={() => deleteCalEvent(ev.id)} style={delBtnStyle}>삭제</button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        };
                        return (
                          <tr key={d.key} style={{ borderBottom: '1px solid #ECFCCB' }}>
                            <td style={{ padding: '0.55rem 0.5rem', verticalAlign: 'middle', background: isToday ? '#ECFCCB' : 'transparent' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: d.date.getDay() === 0 ? '#dc2626' : d.date.getDay() === 6 ? '#2563eb' : 'var(--color-ink-2)' }}>{dow}요일</span>
                                <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>{d.date.getMonth() + 1}.{d.date.getDate()}</span>
                                {isToday && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#65A30D' }}>오늘</span>}
                              </div>
                            </td>
                            <td style={{ padding: '0.55rem 0.5rem', verticalAlign: 'top' }}>{renderList(worshipAll, othersAll)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWorshipWeekOffset((w) => w + 1)}
                      aria-label="다음주"
                      style={{ padding: '0 0.7rem', borderRadius: 10, border: '1px solid #D9F09E', background: '#fff', color: '#65A30D', fontSize: '1.2rem', fontWeight: 800, cursor: 'pointer' }}
                    >›</button>
                  </div>
                </section>

                <section style={{ padding: isMobile ? '1rem' : '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem', order: 1 }}>
                  {(() => {
                    const panelKey = selectedCalDay || todayKey;
                    const isAdmin = Boolean(community?.adminProfileId === profileId);
                    const [pkY, pkM, pkD] = panelKey.split('-').map(Number);
                    const panelDow = (pkY && pkM && pkD) ? new Date(pkY, pkM - 1, pkD).getDay() : -1;
                    const panelDowLabel = panelDow >= 0 ? ['일','월','화','수','목','금','토'][panelDow] : '';
                    return (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>일정확인 <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>(일자별)</span></h2>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ padding: '0.3rem 0.7rem', borderRadius: 999, background: '#ECFCCB', color: '#3F6212', fontSize: isMobile ? '0.88rem' : '0.95rem', fontWeight: 800, letterSpacing: '0.01em' }}>{panelKey}{panelDowLabel ? ` (${panelDowLabel})` : ''}{panelKey === todayKey ? ' · 오늘' : ''}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setRecurType('none');  // 새 일정 등록 시 '반복 안함' 기본
                              if (isAdmin) {
                                setEventScope('worship');
                                if (!worshipTemplateId) {
                                  const def = worshipServices.find((s) => (s as any).isDefault || s.name === '주일예배') || worshipServices.find((s) => !!s.bulletin);
                                  if (def) setWorshipTemplateId(def.id);
                                }
                              } else {
                                setEventScope('personal');
                              }
                              setEventShared(false);
                              setCalForm({ ...calForm, title: isAdmin ? '주일예배' : calForm.title, startAt: `${panelKey}T09:00`, endAt: `${panelKey}T10:00` });
                              setEventModalOpen(true);
                            }}
                            style={{ padding: '0.3rem 0.65rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}
                          >
                            + 일정추가
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              disabled
                              title="준비 중 — 주보 사진/PDF에서 일정을 자동 추출합니다"
                              style={{
                                padding: '0.3rem 0.65rem',
                                borderRadius: 'var(--radius-md)',
                                border: '1px dashed var(--color-gray)',
                                background: '#F3F4F6',
                                color: 'var(--color-ink-2)',
                                fontWeight: 800,
                                fontSize: '0.8rem',
                                cursor: 'not-allowed',
                                opacity: 0.7,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              📷 사진으로 일정추가
                              <span style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>(준비중)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.5rem' }}>
                    <style>{`
                      @keyframes calSlideLeft { from { transform: translateX(24px); opacity: 0.3; } to { transform: translateX(0); opacity: 1; } }
                      @keyframes calSlideRight { from { transform: translateX(-24px); opacity: 0.3; } to { transform: translateX(0); opacity: 1; } }
                    `}</style>
                    <button type="button" onClick={goPrev} aria-label="이전 달" style={{ flex: '0 0 auto', width: 40, borderRadius: 12, border: '1px solid var(--color-surface-border)', background: '#F9FCFB', color: 'var(--color-ink-2)', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>‹</button>
                  <div key={`${year}-${monthIdx}`} style={{ flex: 1, minWidth: 0, padding: '0.55rem 0.75rem', borderRadius: 12, background: 'linear-gradient(180deg, #F0FDF4 0%, #F9FCFB 100%)', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.25rem', animation: calSlideDir === 'left' ? 'calSlideLeft 0.25s ease' : calSlideDir === 'right' ? 'calSlideRight 0.25s ease' : undefined }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <button type="button" onClick={() => setYearPickerOpen((v) => !v)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-ink)', fontSize: '0.82rem', fontWeight: 700, padding: '0.1rem 0.3rem' }}>
                          {year}년 ▾
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const [y, m] = todayKey.split('-');
                            setCalView({ year: Number(y), month: Number(m) });
                            setSelectedCalDay(todayKey);
                            setYearPickerOpen(false);
                          }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-primary-deep)', fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.3rem', textDecoration: 'underline' }}
                        >
                          오늘
                        </button>
                        {yearPickerOpen && (
                          <>
                            <div onClick={() => setYearPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                            <ul style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 40, margin: 0, padding: '0.25rem', listStyle: 'none', background: '#fff', border: '1px solid var(--color-gray)', borderRadius: 8, boxShadow: 'var(--shadow-card)', maxHeight: 200, overflowY: 'auto', minWidth: 80 }}>
                              {yearOptions.map((y) => (
                                <li key={y}>
                                  <button type="button" onClick={() => { setCalView({ year: y, month: monthIdx + 1 }); setYearPickerOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '0.35rem 0.6rem', border: 'none', background: y === year ? 'var(--color-primary-tint)' : 'transparent', color: 'var(--color-ink)', fontWeight: y === year ? 800 : 600, fontSize: '0.8rem', cursor: 'pointer', borderRadius: 6 }}>
                                    {y}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 0.25rem' }}>
                        <button type="button" onClick={goPrev} style={{ background: 'transparent', border: 'none', color: 'var(--color-ink-2)', fontSize: '0.8rem', cursor: 'pointer', padding: '0.1rem 0.3rem', fontWeight: 600 }}>‹ {prevMonth}월</button>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, height: 36, padding: '0 0.6rem', borderRadius: 999, background: 'var(--color-primary)', color: '#ffffff', fontWeight: 800, fontSize: '0.95rem', boxShadow: '0 2px 6px rgba(32, 205, 141, 0.3)' }}>{monthIdx + 1}월</span>
                        <button type="button" onClick={goNext} style={{ background: 'transparent', border: 'none', color: 'var(--color-ink-2)', fontSize: '0.8rem', cursor: 'pointer', padding: '0.1rem 0.3rem', fontWeight: 600 }}>{nextMonth}월 ›</button>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.3rem', padding: '0 0.35rem' }}>
                      {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
                        <span key={w} style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, padding: '0.3rem 0', color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--color-ink-2)' }}>{w}</span>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.3rem', padding: '0 0.35rem 0.35rem' }}>
                      {cells.map((cell, idx) => {
                        if (!cell) return <span key={idx} />;
                        const d = cell.date;
                        const key = cell.key;
                        // 달력에는 예배/기도회(일반·특별·기도회·특별기도회)를 제외한 일정만 표시
                        const dayEventsRaw = eventsByDay.get(key) || [];
                        // 달력에는 일반예배/기도회만 제외 (특별예배·특별기도회는 포함)
                        const EXCLUDE_IN_CAL = ['일반예배', '기도회'];
                        const dayEvents = dayEventsRaw.filter((e: any) => {
                          if (e?._isWorshipService) return false;
                          return !EXCLUDE_IN_CAL.includes(e.category);
                        });
                        const hasEvent = dayEvents.length > 0;
                        const categories = Array.from(new Set(dayEvents.map((e: any) => e.category || '기타')));
                        const primaryCat = categories[0] as string | undefined;
                        const cc = colorFor(primaryCat);
                        const multi = categories.length > 1;
                        const isToday = key === todayKey;
                        const isSelected = selectedCalDay === key;
                        const dow = d.getDay();
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedCalDay(isSelected ? null : key)}
                            title={hasEvent ? dayEvents.map((e: any) => `[${e.category || '일정'}] ${e.title}`).join(', ') : ''}
                            style={{
                              minHeight: 44,
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 2,
                              borderRadius: 8,
                              background: isSelected ? 'var(--color-primary)' : hasEvent && !multi ? cc.bg : isToday ? 'var(--color-primary-tint)' : 'transparent',
                              border: isSelected ? '1px solid var(--color-primary)' : hasEvent ? `1.5px solid ${cc.border}` : isToday ? '1px solid var(--color-primary)' : '1px solid transparent',
                              fontSize: '0.74rem',
                              color: isSelected ? '#ffffff' : hasEvent ? cc.fg : dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink)',
                              fontWeight: isToday || isSelected || hasEvent ? 800 : 600,
                              cursor: 'pointer',
                              padding: 0,
                              overflow: 'hidden',
                            }}
                          >
                            {hasEvent && multi && !isSelected && (
                              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', zIndex: 0, borderRadius: 7 }}>
                                {categories.map((c) => {
                                  const cx = colorFor(c);
                                  return <span key={c} title={c} style={{ flex: 1, background: cx.bg }} />;
                                })}
                              </span>
                            )}
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem', lineHeight: 1, position: 'relative', zIndex: 1 }}>
                              <span>{d.getDate()}</span>
                              {isToday && <span style={{ fontSize: '0.52rem', fontWeight: 800, color: isSelected ? 'var(--color-primary)' : '#fff', background: isSelected ? '#fff' : 'var(--color-primary)', padding: '0.04rem 0.26rem', borderRadius: 999, lineHeight: 1 }}>오늘</span>}
                            </span>
                            {isSelected && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecurType('none');  // 새 일정 등록 시 '반복 안함' 기본
                                  const isAdminUser = Boolean(community?.adminProfileId === profileId);
                                  if (isAdminUser) {
                                    setEventScope('worship');
                                    if (!worshipTemplateId) {
                                      const def = worshipServices.find((s) => (s as any).isDefault || s.name === '주일예배') || worshipServices.find((s) => !!s.bulletin);
                                      if (def) setWorshipTemplateId(def.id);
                                    }
                                  } else {
                                    setEventScope('personal');
                                  }
                                  setEventShared(false);
                                  setCalForm({ ...calForm, title: isAdminUser ? '주일예배' : calForm.title, startAt: `${key}T09:00`, endAt: `${key}T10:00` });
                                  setEventModalOpen(true);
                                }}
                                style={{ position: 'absolute', top: -10, right: -10, width: 28, height: 28, borderRadius: 999, background: '#ffffff', color: 'var(--color-primary-deep)', border: '1.5px solid var(--color-primary)', fontSize: '1.15rem', fontWeight: 900, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 3px 10px rgba(0,0,0,0.2)' }}
                                title={`${key} 일정 추가`}
                              >
                                +
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ textAlign: 'right', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.6rem', color: 'var(--color-ink-2)', fontWeight: 500 }}>Asia/Singapore</span>
                    </div>
                  </div>
                    <button type="button" onClick={goNext} aria-label="다음 달" style={{ flex: '0 0 auto', width: 40, borderRadius: 12, border: '1px solid var(--color-surface-border)', background: '#F9FCFB', color: 'var(--color-ink-2)', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>›</button>
                  </div>
                  {(() => {
                    const panelKey = selectedCalDay || todayKey;
                    const dayEvents = eventsByDay.get(panelKey) || [];
                    const isAdmin = Boolean(community?.adminProfileId === profileId);
                    const dateObj = new Date(`${panelKey}T00:00`);
                    const dowLabel = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
                    const dateLabel = `${dateObj.getFullYear()}. ${String(dateObj.getMonth() + 1).padStart(2, '0')}. ${String(dateObj.getDate()).padStart(2, '0')} (${dowLabel})${panelKey === todayKey ? ' · 오늘' : ''}`;
                    return (
                      <div style={{ padding: '0.75rem 1rem', borderRadius: 12, background: '#ffffff', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.6rem' }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-ink)', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-surface-border)' }}>
                          📅 {dateLabel}
                        </div>
                        {dayEvents.length === 0 ? (
                          <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.85rem' }}>등록된 일정이 없습니다.</p>
                        ) : (
                          <div style={{ display: 'grid', gap: '0.35rem' }}>
                            {dayEvents.map((ev) => {
                              const cat = (ev as any).category as string | undefined;
                              const cc = colorFor(cat);
                              const badgeLabel = cat
                                || ((ev as any).scope === 'worship' ? '예배'
                                    : ev.scope === 'community' ? '공동체'
                                    : ev.scope === 'personal' ? (ev.createdByName || '개인')
                                    : '일정');
                              const timeLabel = new Date(ev.startAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                              return (
                                <div key={ev.id} style={isMobile ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.6rem', borderRadius: 8, background: '#F9FCFB', border: '1px solid var(--color-surface-border)', fontSize: '0.8rem' } : { display: 'grid', gridTemplateColumns: 'auto 60px 1fr auto auto', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.6rem', borderRadius: 8, background: '#F9FCFB', border: '1px solid var(--color-surface-border)', fontSize: '0.85rem' }}>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '0.15rem 0.55rem',
                                    borderRadius: 999,
                                    background: cc.bg,
                                    border: `1px solid ${cc.border}`,
                                    color: cc.fg,
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    whiteSpace: 'nowrap',
                                  }}>{badgeLabel}</span>
                                  <span style={{ color: 'var(--color-ink-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{timeLabel}</span>
                                  <span style={{ fontWeight: 700, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                                  <button type="button" aria-label={`${ev.title} 수정`} onClick={() => {
                                    if ((ev as any)._isWorshipService) {
                                      const ws = worshipServices.find((s) => s.id === ev.id);
                                      if (!ws) return;
                                      setEditingService(ws);
                                      setEditingBulletin(ws.bulletin ? JSON.parse(JSON.stringify(ws.bulletin)) : (ws.resolvedBulletin ? JSON.parse(JSON.stringify(ws.resolvedBulletin)) : {}));
                                      return;
                                    }
                                    // 반복 시리즈인 경우 "전체 / 이 회차만" 선택 모달
                                    const seriesId = (ev as any).seriesId || ev.id;
                                    const siblings = calEvents.filter((e) => e.id !== ev.id && ((e as any).seriesId || e.id) === seriesId);
                                    const isSeries = siblings.length > 0 || !!(ev as any).rule;
                                    if (isSeries) {
                                      setEditChoiceModal({ target: ev, siblings });
                                      return;
                                    }
                                    // 단건: 바로 수정 폼 오픈
                                    const toLocal = (iso: string) => {
                                      const d = new Date(iso);
                                      const pad = (n: number) => String(n).padStart(2, '0');
                                      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                    };
                                    setEventScope((ev.scope as any) || 'community');
                                    setEventShared(!!(ev as any).shared);
                                    setCalForm({ title: ev.title, startAt: toLocal(ev.startAt), endAt: toLocal(ev.endAt), location: ev.location || '', description: ev.description || '' });
                                    setRecurType('none');
                                    setEditingEventId(ev.id);
                                    setEditScope('all');
                                    setEventModalOpen(true);
                                  }} style={{ minHeight: 36, background: 'transparent', border: 'none', color: 'var(--color-primary-deep)', fontSize: '0.76rem', cursor: 'pointer', padding: '0 0.4rem', whiteSpace: 'nowrap', fontWeight: 700 }}>수정</button>
                                  <button type="button" aria-label={`${ev.title} 삭제`} onClick={() => deleteCalEvent(ev.id)} style={{ minHeight: 36, background: 'transparent', border: 'none', color: 'var(--color-danger)', fontSize: '0.76rem', cursor: 'pointer', padding: '0 0.4rem', whiteSpace: 'nowrap' }}>삭제</button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  </div>

                </section>

                {icsUrl && scopedAdminCommunities.length > 0 && (
                  <section style={{ padding: '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>Google 캘린더 구독</h2>
                    {!mgmtCommunityId && (
                      <div style={{ display: 'grid', gap: '0.4rem' }}>
                        <label style={{ color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.88rem' }}>공동체 선택</label>
                        <select value={calCommunityId} onChange={(e) => setCalCommunityId(e.target.value)} style={{ padding: '0.75rem 0.95rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#ffffff', color: 'var(--color-ink)', fontSize: '0.95rem', appearance: 'none' }}>
                          {scopedAdminCommunities.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <a href={gcalUrl} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start', padding: '0.55rem 1rem', borderRadius: 10, background: 'var(--color-primary)', color: '#ffffff', fontWeight: 700, textDecoration: 'none', fontSize: '0.85rem', boxShadow: 'var(--shadow-button)', whiteSpace: 'nowrap' }}>
                      + Google 캘린더에 추가
                    </a>
                    <div style={{ display: 'grid', gap: '0.35rem', minWidth: 0 }}>
                      <span style={{ color: 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700 }}>구독 URL</span>
                      <code style={{ display: 'block', padding: '0.6rem 0.8rem', background: '#fff', border: '1px solid var(--color-surface-border)', borderRadius: 8, color: 'var(--color-ink)', fontSize: '0.78rem', overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' }}>{icsUrl}</code>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => navigator.clipboard?.writeText(icsUrl)} style={{ flex: '1 1 120px', padding: '0.55rem 0.85rem', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#ffffff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>복사</button>
                        <a href={webcalUrl} style={{ flex: '1 1 120px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.55rem 0.85rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>webcal 열기</a>
                      </div>
                    </div>
                    <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.78rem', lineHeight: 1.55 }}>
                      이 URL을 셀원들에게 공유하면 Google 캘린더 <strong style={{ color: 'var(--color-ink)', fontWeight: 700 }}>다른 캘린더 → URL로 추가</strong>에서 한 번 구독 후 일정이 자동 동기화됩니다.
                    </p>
                  </section>
                )}
                </>
              );
            })()}

            {eventModalOpen && (() => {
              const currentCommunity = adminCommunities.find((c) => c.id === calCommunityId);
              const isCurrentAdmin = Boolean(currentCommunity);
              return (
                <div onClick={() => { setEventModalOpen(false); setEditingEventId(null); }} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem' }}>
                  <div role="dialog" aria-modal="true" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: isMobile ? '100%' : 520, background: '#fff', borderRadius: isMobile ? '18px 18px 0 0' : 16, boxShadow: 'var(--shadow-card-lg)', padding: isMobile ? '1.1rem 1rem 1.5rem' : '1.25rem', display: 'grid', gap: '0.75rem', maxHeight: isMobile ? '92dvh' : undefined, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>{editingEventId ? '일정 수정' : '새 일정 등록'}</h3>
                      <button type="button" onClick={() => { setEventModalOpen(false); setEditingEventId(null); }} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-ink-2)' }}>✕</button>
                    </div>
                    <div role="note" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.55rem 0.75rem', borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', fontSize: '0.8rem', lineHeight: 1.45 }}>
                      <span aria-hidden style={{ fontSize: '0.95rem', lineHeight: 1.2 }}>ℹ️</span>
                      <span>
                        저장한 일정은 일반 사용자 대시보드의 <strong>‘교회일정’ 메뉴</strong>에도 자동으로 공개됩니다. 내부 확인용이라면 제목·설명에 개인정보가 포함되지 않도록 유의해 주세요.
                      </span>
                    </div>
                    {isCurrentAdmin && (
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <label style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.88rem', cursor: 'pointer', padding: eventScope === 'worship' ? '0.35rem 0.7rem' : '0.35rem 0.7rem', borderRadius: 999, border: eventScope === 'worship' ? '1px solid #20CD8D' : '1px solid transparent', background: eventScope === 'worship' ? 'var(--color-primary-tint)' : 'transparent', color: eventScope === 'worship' ? '#20CD8D' : 'var(--color-ink)', fontWeight: eventScope === 'worship' ? 800 : 400 }}>
                          <input type="radio" name="eventScope" checked={eventScope === 'worship'} onChange={() => {
                            setEventScope('worship');
                            setRecurType('none');
                            if (!worshipTemplateId) {
                              const def = worshipServices.find((s) => (s as any).isDefault || s.name === '주일예배') || worshipServices.find((s) => !!s.bulletin);
                              if (def) setWorshipTemplateId(def.id);
                            }
                            if (!calForm.title.trim()) setCalForm({ ...calForm, title: '주일예배' });
                          }} />
                          {eventScope === 'worship' && <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>⛪</span>}
                          예배일정 <span style={{ color: eventScope === 'worship' ? '#20CD8D' : 'var(--color-ink-2)', fontWeight: 500, fontSize: '0.78rem' }}>(관리자)</span>
                        </label>
                        <label style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', fontSize: '0.88rem', cursor: 'pointer', padding: '0.35rem 0.7rem', borderRadius: 999, border: eventScope === 'community' ? '1px solid #2563eb' : '1px solid transparent', background: eventScope === 'community' ? '#DBEAFE' : 'transparent', color: eventScope === 'community' ? '#1E40AF' : 'var(--color-ink)', fontWeight: eventScope === 'community' ? 800 : 400 }}>
                          <input type="radio" name="eventScope" checked={eventScope === 'community'} onChange={() => {
                            setEventScope('community');
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            const pad = (n: number) => String(n).padStart(2, '0');
                            const dateStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
                            setCalForm({
                              ...calForm,
                              title: '새가족 환영회',
                              startAt: `${dateStr}T10:00`,
                              endAt: `${dateStr}T12:00`,
                            });
                          }} />
                          {eventScope === 'community' && <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>👥</span>}
                          공동체 일정 <span style={{ color: eventScope === 'community' ? '#1E40AF' : 'var(--color-ink-2)', fontWeight: 500, fontSize: '0.78rem' }}>(관리자)</span>
                        </label>
                      </div>
                    )}
                    <div style={{ display: 'grid', gap: '0.3rem', padding: '0.5rem 0.75rem', borderRadius: 10, background: '#ECFCCB', border: '1px solid #D9F09E' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#3F6212' }}>구분</label>
                        <select
                          value={eventCategory}
                          onChange={(e) => setEventCategory(e.target.value)}
                          style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid #D9F09E', fontSize: '0.9rem', color: 'var(--color-ink)', background: '#fff', minWidth: 140, fontWeight: 700 }}
                        >
                          {eventCategories.length === 0 ? <option value="">(없음)</option> : null}
                          {sortCategories(eventCategories).map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        {eventScope !== 'worship' && (() => {
                          const sStr = calForm.startAt || '';
                          const eStr = calForm.endAt || '';
                          const allDay = sStr.endsWith('T00:00') && eStr.endsWith('T23:59');
                          return (
                            <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: '#3F6212', cursor: 'pointer', padding: '0.25rem 0.55rem', borderRadius: 8, background: allDay ? '#fff' : 'transparent', border: `1px solid ${allDay ? '#D9F09E' : 'transparent'}` }}>
                              <input
                                type="checkbox"
                                checked={allDay}
                                onChange={(e) => {
                                  const sDate = sStr.slice(0, 10);
                                  const eDate = (eStr.slice(0, 10) || sDate);
                                  if (!sDate) return;
                                  if (e.target.checked) {
                                    setCalForm({ ...calForm, startAt: `${sDate}T00:00`, endAt: `${eDate}T23:59` });
                                  } else {
                                    setCalForm({ ...calForm, startAt: `${sDate}T09:00`, endAt: `${sDate}T10:00` });
                                  }
                                }}
                                style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#65A30D' }}
                              />
                              종일
                              <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--color-ink-2)' }}>(체크 시 시간 미표시)</span>
                            </label>
                          );
                        })()}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#65A30D' }}>※ 기타설정에서 추가·삭제</span>
                    </div>
                    <input
                      type="text"
                      value={calForm.title}
                      onChange={(e) => setCalForm({ ...calForm, title: e.target.value })}
                      placeholder={eventScope === 'worship' ? '주일예배' : '제목'}
                      style={{ padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.92rem', color: 'var(--color-ink)' }}
                    />
                    {eventScope === 'worship' ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <DateTimePicker value={calForm.startAt} onChange={(v) => setCalForm({ ...calForm, startAt: v })} placeholder="예배일자" style={isMobile ? { flex: '1 1 100%', minWidth: 0, width: '100%' } : { flex: '0 0 auto', minWidth: 0, width: 200 }} />
                        {locationMode === 'custom' ? (
                          <input
                            type="text"
                            autoFocus
                            value={calForm.location}
                            onChange={(e) => setCalForm({ ...calForm, location: e.target.value })}
                            placeholder="장소 직접 입력"
                            style={{ flex: 1, minWidth: 140, padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.92rem', color: 'var(--color-ink)' }}
                          />
                        ) : (
                          <select
                            value={calForm.location}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                setLocationMode('custom');
                                setCalForm({ ...calForm, location: '' });
                              } else {
                                setCalForm({ ...calForm, location: e.target.value });
                              }
                            }}
                            style={{ flex: 1, minWidth: 140, padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.92rem', color: 'var(--color-ink)', background: '#fff' }}
                          >
                            <option value="__custom__">직접입력</option>
                            <option value="">장소 선택 (선택)</option>
                            {venueList.map((v) => (<option key={v.id} value={`${v.floor} ${v.name}(${v.code})`}>{v.floor} · {v.name} ({v.code})</option>))}
                          </select>
                        )}
                        {locationMode === 'custom' && (
                          <button type="button" onClick={() => { setLocationMode('select'); setCalForm({ ...calForm, location: '' }); }} style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>목록에서 선택</button>
                        )}
                      </div>
                    ) : (
                      <>
                        {(() => {
                          const sStr = calForm.startAt || '';
                          const eStr = calForm.endAt || '';
                          const isAllDay = sStr.endsWith('T00:00') && eStr.endsWith('T23:59');
                          return (
                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-ink-2)', minWidth: 28 }}>시작</label>
                            <DateTimePicker
                              value={calForm.startAt}
                              dateOnly={isAllDay}
                              onChange={(v) => {
                                if (isAllDay) {
                                  const sDate = v.slice(0, 10);
                                  const eDate = (calForm.endAt || '').slice(0, 10) || sDate;
                                  setCalForm({ ...calForm, startAt: `${sDate}T00:00`, endAt: `${eDate}T23:59` });
                                  return;
                                }
                                // 시작을 바꾸면 끝이 비어있거나 시작보다 이른 경우 자동으로 +1h (같은 날짜)
                                const startDate = new Date(v);
                                const endDate = calForm.endAt ? new Date(calForm.endAt) : null;
                                let nextEndAt = calForm.endAt;
                                if (!endDate || isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
                                  const autoEnd = new Date(startDate.getTime() + 60 * 60 * 1000);
                                  const p = (n: number) => String(n).padStart(2, '0');
                                  nextEndAt = `${autoEnd.getFullYear()}-${p(autoEnd.getMonth() + 1)}-${p(autoEnd.getDate())}T${p(autoEnd.getHours())}:${p(autoEnd.getMinutes())}`;
                                }
                                setCalForm({ ...calForm, startAt: v, endAt: nextEndAt });
                              }}
                              placeholder="시작"
                              style={isMobile ? { flex: 1, minWidth: 0 } : undefined}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-ink-2)', minWidth: 28 }}>종료</label>
                            <DateTimePicker
                              value={calForm.endAt}
                              dateOnly={isAllDay}
                              onChange={(v) => {
                                if (isAllDay) {
                                  const eDate = v.slice(0, 10);
                                  setCalForm({ ...calForm, endAt: `${eDate}T23:59` });
                                  return;
                                }
                                setCalForm({ ...calForm, endAt: v });
                              }}
                              placeholder="종료"
                              style={isMobile ? { flex: 1, minWidth: 0 } : undefined}
                            />
                          </div>
                        </div>
                          );
                        })()}
                        {(() => {
                          // 시작일과 종료일이 다른(멀티데이) 일정 → 장소 숨김
                          // 종일(T00:00 ~ T23:59) 일정 → 장소 숨김 (장소가 의미 없음)
                          const sStr = calForm.startAt || '';
                          const eStr = calForm.endAt || '';
                          const sDate = sStr.slice(0, 10);
                          const eDate = eStr.slice(0, 10);
                          if (sDate && eDate && sDate !== eDate) return null;
                          const isAllDay = sStr.endsWith('T00:00') && eStr.endsWith('T23:59');
                          if (isAllDay) return null;
                          return (
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {locationMode === 'custom' ? (
                            <input
                              type="text"
                              autoFocus
                              value={calForm.location}
                              onChange={(e) => setCalForm({ ...calForm, location: e.target.value })}
                              placeholder="장소 직접 입력"
                              style={{ flex: 1, minWidth: 140, padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.92rem', color: 'var(--color-ink)' }}
                            />
                          ) : (
                            <select
                              value={calForm.location}
                              onChange={(e) => {
                                if (e.target.value === '__custom__') {
                                  setLocationMode('custom');
                                  setCalForm({ ...calForm, location: '' });
                                } else {
                                  setCalForm({ ...calForm, location: e.target.value });
                                }
                              }}
                              style={{ flex: 1, minWidth: 140, padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.92rem', color: 'var(--color-ink)', background: '#fff' }}
                            >
                              <option value="__custom__">직접입력</option>
                              <option value="">장소 선택 (선택)</option>
                              {venueList.map((v) => (<option key={v.id} value={`${v.floor} ${v.name}(${v.code})`}>{v.floor} · {v.name} ({v.code})</option>))}
                            </select>
                          )}
                          {locationMode === 'custom' && (
                            <button type="button" onClick={() => { setLocationMode('select'); setCalForm({ ...calForm, location: '' }); }} style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>목록에서 선택</button>
                          )}
                        </div>
                          );
                        })()}
                      </>
                    )}
                    {(() => {
                      // 시작일과 종료일이 다른(멀티데이) 일정은 반복 옵션을 숨긴다 (종일/멀티데이 일정은 반복 불가 정책)
                      const sDate = (calForm.startAt || '').slice(0, 10);
                      const eDate = (calForm.endAt || '').slice(0, 10);
                      const isMultiDay = sDate && eDate && sDate !== eDate;
                      if (isMultiDay) return null;
                      return (
                    <div style={{ display: 'grid', gap: '0.4rem', padding: '0.6rem 0.75rem', borderRadius: 10, background: '#F8FAFC', border: '1px solid var(--color-surface-border)' }}>
                      <div style={{ display: 'grid', gap: '0.15rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-ink)', flex: isMobile ? '1 1 100%' : 'none' }}>{eventScope === 'worship' ? '이번 이후의 예배일정도 미리 등록해둘까요?' : '반복'}</span>
                          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', minHeight: 40, padding: isMobile ? '0 0.6rem' : 0, borderRadius: isMobile ? 8 : 0, background: isMobile && recurType !== 'none' ? 'var(--color-primary-tint)' : 'transparent', border: isMobile && recurType !== 'none' ? '1px solid var(--color-primary)' : 'none', fontSize: '0.88rem', color: 'var(--color-ink)', cursor: 'pointer', fontWeight: recurType !== 'none' ? 700 : 400 }}>
                            <input type="radio" name="recurToggle" checked={recurType !== 'none'} onChange={() => setRecurType('weekly')} /> {eventScope === 'worship' ? '예' : '반복함'}
                          </label>
                          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', minHeight: 40, padding: isMobile ? '0 0.6rem' : 0, borderRadius: isMobile ? 8 : 0, background: isMobile && recurType === 'none' ? '#F1F5F9' : 'transparent', border: isMobile && recurType === 'none' ? '1px solid var(--color-gray)' : 'none', fontSize: '0.88rem', color: 'var(--color-ink)', cursor: 'pointer', fontWeight: recurType === 'none' ? 700 : 400 }}>
                            <input type="radio" name="recurToggle" checked={recurType === 'none'} onChange={() => setRecurType('none')} /> {eventScope === 'worship' ? '아니오' : '반복 안함'}
                          </label>
                        </div>
                        {eventScope === 'worship' && (
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#20CD8D' }}><strong style={{ fontWeight: 800 }}>최대 3개월</strong>까지의 예배계획을 미리 등록할 수 있고 이후 자동연장됩니다</p>
                        )}
                        {eventScope === 'community' && (
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#1E40AF' }}><strong style={{ fontWeight: 800 }}>최대 1년</strong>까지의 공동체 일정을 미리 등록할 수 있습니다</p>
                        )}
                      </div>
                      {recurType !== 'none' && (
                        <>
                          {(() => {
                            const sd = calForm.startAt ? new Date(calForm.startAt) : new Date();
                            const hr = sd.getHours();
                            const min = sd.getMinutes();
                            const ampm = hr < 12 ? '오전' : '오후';
                            const h12 = ((hr + 11) % 12) + 1;
                            const timeLabel = min > 0 ? `${ampm} ${h12}시 ${min}분` : `${ampm} ${h12}시`;
                            const dowLabel = ['일', '월', '화', '수', '목', '금', '토'][sd.getDay()];
                            const dateLabel = `${sd.getMonth() + 1}월 ${sd.getDate()}일`;
                            const baseOptions = [
                              { v: 'daily' as const, label: `매일 1회 : ${timeLabel}` },
                              { v: 'weekly' as const, label: `매주 1회 : ${dowLabel}요일 ${timeLabel}` },
                              { v: 'monthly' as const, label: `매월 1회 : ${dateLabel} ${dowLabel}요일 ${timeLabel}` },
                            ];
                            const options = eventScope === 'worship'
                              ? [...baseOptions, { v: 'custom' as const, label: '사용자지정' }]
                              : [...baseOptions, { v: 'yearly' as const, label: `매년 1회 : ${dateLabel} ${timeLabel}` }, { v: 'custom' as const, label: '사용자지정' }];
                            return (
                              <div style={{ display: 'grid', gap: '0.35rem' }}>
                                {options.map((opt) => (
                                  <label key={opt.v} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                                    <input
                                      type="radio"
                                      name="recurFreq"
                                      checked={recurType === opt.v}
                                      onChange={() => {
                                        setRecurType(opt.v);
                                        const horizonMonths = eventScope === 'worship' ? 3 : eventScope === 'community' ? 12 : 0;
                                        if (horizonMonths > 0) {
                                          const startDate = calForm.startAt ? new Date(calForm.startAt) : new Date();
                                          const horizon = new Date(startDate);
                                          horizon.setMonth(horizon.getMonth() + horizonMonths);
                                          const pad = (n: number) => String(n).padStart(2, '0');
                                          const untilStr = `${horizon.getFullYear()}-${pad(horizon.getMonth() + 1)}-${pad(horizon.getDate())}`;
                                          const daysDiff = Math.floor((horizon.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
                                          // 새 일정 등록 시 반복 횟수 기본 5회
                                          const defaultCount = editingEventId ? (opt.v === 'daily' ? daysDiff : opt.v === 'weekly' ? (eventScope === 'worship' ? 12 : Math.floor(daysDiff / 7)) : opt.v === 'monthly' ? horizonMonths : opt.v === 'yearly' ? 1 : horizonMonths) : 5;
                                          if (opt.v === 'daily') { setRecurEndType('count'); setRecurCount(defaultCount); setRecurUntil(untilStr); }
                                          else if (opt.v === 'weekly') { setRecurEndType('count'); setRecurCount(defaultCount); setRecurUntil(untilStr); }
                                          else if (opt.v === 'monthly') { setRecurEndType('count'); setRecurCount(defaultCount); setRecurUntil(untilStr); }
                                          else if (opt.v === 'yearly') { setRecurEndType('count'); setRecurCount(defaultCount); setRecurUntil(untilStr); }
                                          else if (opt.v === 'custom') { setRecurEndType('count'); setRecurCount(defaultCount); setRecurUntil(untilStr); setRecurUnit('month'); }
                                        } else if (opt.v === 'custom') {
                                          setRecurUnit('month');
                                        }
                                      }}
                                    />
                                    {opt.label}
                                    {opt.v === 'custom' && recurType === 'custom' && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', marginLeft: '0.3rem', gap: '0.3rem' }}>
                                        {(['week', 'month'] as const).map((u) => (
                                          <button
                                            key={u}
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); setRecurUnit(u); }}
                                            style={{ padding: '0.25rem 0.6rem', borderRadius: 8, background: recurUnit === u ? 'var(--color-primary)' : 'var(--color-primary-tint)', color: recurUnit === u ? '#fff' : 'var(--color-primary-deep)', border: 'none', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer' }}
                                          >{u === 'week' ? '매주' : '매월'}</button>
                                        ))}
                                        {recurUnit === 'week' && (() => {
                                          const dows = [0, 1, 2, 3, 4, 5, 6];
                                          const labels = ['일', '월', '화', '수', '목', '금', '토'];
                                          return dows.map((d) => {
                                            const on = recurDays.includes(d);
                                            return (
                                              <button
                                                key={d}
                                                type="button"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  const nextDays = on ? recurDays.filter((x) => x !== d) : [...recurDays, d].sort();
                                                  setRecurDays(nextDays);
                                                }}
                                                style={{ padding: '0.2rem 0.55rem', borderRadius: 999, border: on ? '1px solid var(--color-primary)' : '1px solid var(--color-gray)', background: on ? 'var(--color-primary-tint)' : '#fff', color: on ? 'var(--color-primary-deep)' : (d === 0 ? '#dc2626' : d === 6 ? '#2563eb' : 'var(--color-ink-2)'), fontWeight: on ? 800 : 600, fontSize: '0.76rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                                              >{labels[d]}</button>
                                            );
                                          });
                                        })()}
                                        {recurUnit === 'month' && (() => {
                                          const weeks = [1, 2, 3, 4, 5];
                                          const labels = ['첫째주', '둘째주', '셋째주', '넷째주', '다섯째주'];
                                          return weeks.map((w) => {
                                            const on = recurWeeks.includes(w);
                                            return (
                                              <button
                                                key={w}
                                                type="button"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  const nextWeeks = on ? recurWeeks.filter((x) => x !== w) : [...recurWeeks, w].sort();
                                                  setRecurWeeks(nextWeeks);
                                                  if (eventScope === 'worship') {
                                                    const selectedCount = Math.max(nextWeeks.length, 1);
                                                    setRecurCount(3 * selectedCount);
                                                  }
                                                }}
                                                style={{ padding: '0.2rem 0.45rem', borderRadius: 999, border: on ? '1px solid var(--color-primary)' : '1px solid var(--color-gray)', background: on ? 'var(--color-primary-tint)' : '#fff', color: on ? 'var(--color-primary-deep)' : 'var(--color-ink-2)', fontWeight: on ? 800 : 600, fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                                              >{labels[w - 1]}</button>
                                            );
                                          });
                                        })()}
                                      </span>
                                    )}
                                  </label>
                                ))}
                                {recurType === 'custom' && (() => {
                                  const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
                                  let previewText = `해당 주 ${dowLabel}요일 ${timeLabel}`;
                                  if (recurUnit === 'week') {
                                    const days = recurDays.length > 0 ? recurDays.map((d) => dowLabels[d]).join(', ') : dowLabel;
                                    previewText = `매주 ${days}요일 ${timeLabel}`;
                                  } else if (recurUnit === 'month' && recurWeeks.length > 0) {
                                    const weekLabels = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
                                    const w = recurWeeks.map((x) => weekLabels[x - 1]).join(', ');
                                    previewText = `매월 ${w}주 ${dowLabel}요일 ${timeLabel}`;
                                  }
                                  return (
                                    <div style={{ marginLeft: '1.5rem', fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>{previewText}</div>
                                  );
                                })()}
                              </div>
                            );
                          })()}
                          {(() => {
                            const worshipUnit = recurType === 'custom' ? recurUnit : recurType;
                            const worshipMax = eventScope === 'worship' ? (
                              worshipUnit === 'daily' || worshipUnit === 'day' ? 365 :
                              worshipUnit === 'weekly' || worshipUnit === 'week' ? 52 :
                              worshipUnit === 'monthly' || worshipUnit === 'month' ? 12 :
                              366
                            ) : 366;
                            const startDate = calForm.startAt ? new Date(calForm.startAt) : new Date();
                            const oneYearLater = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
                            const pad2 = (n: number) => String(n).padStart(2, '0');
                            const maxUntil = `${oneYearLater.getFullYear()}-${pad2(oneYearLater.getMonth() + 1)}-${pad2(oneYearLater.getDate())}`;
                            return (
                              <>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                  <label style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                                    <input type="radio" name="recurEnd" checked={recurEndType === 'count'} onChange={() => setRecurEndType('count')} /> 횟수
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={worshipMax}
                                    value={recurCount}
                                    onChange={(e) => setRecurCount(Math.max(1, Math.min(worshipMax, Number(e.target.value) || 1)))}
                                    disabled={recurEndType !== 'count'}
                                    style={{ width: 80, padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem' }}
                                  />
                                  <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>회</span>
                                  <label style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                                    <input type="radio" name="recurEnd" checked={recurEndType === 'until'} onChange={() => setRecurEndType('until')} /> 날짜까지
                                  </label>
                                  <input
                                    type="date"
                                    value={recurUntil}
                                    max={eventScope === 'worship' ? maxUntil : undefined}
                                    onChange={(e) => {
                                      let v = e.target.value;
                                      if (eventScope === 'worship' && v > maxUntil) v = maxUntil;
                                      setRecurUntil(v);
                                    }}
                                    disabled={recurEndType !== 'until'}
                                    style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem' }}
                                  />
                                </div>
                              </>
                            );
                          })()}
                        </>
                      )}
                    </div>
                      );
                    })()}
                    {calMsg && <p style={{ margin: 0, fontSize: '0.82rem', color: calMsg.includes('등록') ? 'var(--color-primary-deep)' : 'var(--color-danger)' }}>{calMsg}</p>}
                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button type="button" onClick={() => { setEventModalOpen(false); setEditingEventId(null); }} style={{ minHeight: 48, padding: '0 1.1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, cursor: 'pointer', fontSize: isMobile ? '0.95rem' : '0.88rem' }}>취소</button>
                      <button type="button" onClick={createCalEvent} disabled={calSaving} style={{ minHeight: 48, padding: '0 1.1rem', borderRadius: 'var(--radius-lg)', border: 'none', background: calSaving ? 'rgba(32, 205, 141, 0.5)' : 'var(--color-primary)', color: '#fff', fontWeight: 800, cursor: calSaving ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-button)', fontSize: isMobile ? '0.95rem' : '0.88rem' }}>
                        {calSaving ? '저장 중…' : '저장'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {deleteModal && (() => {
              const { target, siblings, recId } = deleteModal;
              const totalCount = recId ? '전체' : `${siblings.length + 1}건`;
              const dateLabel = new Date(target.startAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
              return (
                <div onClick={() => setDeleteModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                  <div role="dialog" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 999, background: '#FEE2E2', color: 'var(--color-danger)', fontSize: '1.2rem', flexShrink: 0 }}>!</span>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>반복 일정 삭제</h3>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                          <strong style={{ color: 'var(--color-ink)' }}>{target.title}</strong> · {dateLabel}<br />
                          이 일정은 반복 일정의 일부입니다. 어떻게 삭제할까요?
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => performSeriesDelete('one')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontSize: '0.75rem', fontWeight: 800 }}>1</span>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: '0.92rem' }}>해당 일자만 삭제</span>
                          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-ink-2)', fontWeight: 500 }}>이 한 번의 일정만 제거합니다.</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => performSeriesDelete('all')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', border: '1px solid #FCA5A5', background: '#FEF2F2', color: 'var(--color-danger)', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, background: 'var(--color-danger)', color: '#fff', fontSize: '0.75rem', fontWeight: 800 }}>!</span>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: '0.92rem' }}>전체 일정 삭제 ({totalCount})</span>
                          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-ink-2)', fontWeight: 500 }}>이 시리즈의 모든 일정을 함께 삭제합니다.</span>
                        </span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => setDeleteModal(null)}
                        style={{ padding: '0.55rem 1rem', borderRadius: 'var(--radius-lg)', border: 'none', background: 'transparent', color: 'var(--color-ink-2)', fontWeight: 700, cursor: 'pointer' }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {editChoiceModal && (() => {
              const { target, siblings } = editChoiceModal;
              const totalCount = `${siblings.length + 1}건`;
              const dateLabel = new Date(target.startAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
              return (
                <div onClick={() => setEditChoiceModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                  <div role="dialog" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 999, background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontSize: '1.2rem', flexShrink: 0 }}>✎</span>
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>반복 일정 수정</h3>
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                          <strong style={{ color: 'var(--color-ink)' }}>{target.title}</strong> · {dateLabel}<br />
                          이 일정은 반복 일정의 일부입니다. 어떻게 수정할까요?
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => beginEditWithScope('one')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontSize: '0.75rem', fontWeight: 800 }}>1</span>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: '0.92rem' }}>이 회차만 수정</span>
                          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-ink-2)', fontWeight: 500 }}>선택한 날짜의 일정만 변경합니다.</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => beginEditWithScope('all')}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-primary)', background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 999, background: 'var(--color-primary)', color: '#fff', fontSize: '0.75rem', fontWeight: 800 }}>∀</span>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: 'block', fontSize: '0.92rem' }}>전체 시리즈 수정 ({totalCount})</span>
                          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-ink-2)', fontWeight: 500 }}>기존 시리즈를 삭제하고 새 반복으로 다시 등록합니다.</span>
                        </span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => setEditChoiceModal(null)}
                        style={{ padding: '0.55rem 1rem', borderRadius: 'var(--radius-lg)', border: 'none', background: 'transparent', color: 'var(--color-ink-2)', fontWeight: 700, cursor: 'pointer' }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeMenu === '예배관리' && (
              <section style={{ padding: isMobile ? '1rem' : '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.2rem', color: 'var(--color-ink)' }}>🎨 공동체 디자인 템플릿 설정</h2>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>모든 예배 주보에 공통으로 적용되는 브랜딩입니다. 변경 시 이후 생성되는 예배에 반영되며, 기존 예배에도 일괄 적용할 수 있습니다.</p>
                <div style={{ display: 'grid', gap: '0.85rem', padding: '1rem 1.1rem', borderRadius: 12, background: '#F9FCFB', border: '1px solid var(--color-surface-border)' }}>
                  <div style={{ display: 'grid', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>배경</span>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      {(['default1', 'default2'] as const).map((v) => (
                        <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                          <input type="radio" name="communityBg" checked={communityDesign.background?.type === 'default' && communityDesign.background.value === v} onChange={() => setCommunityDesign({ ...communityDesign, background: { type: 'default', value: v } })} />
                          {v === 'default1' ? '기본1' : '기본2'}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    <label style={{ display: 'grid', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>공동체 이름 (주보 상단)</span>
                      <input type="text" value={communityDesign.churchName || ''} onChange={(e) => setCommunityDesign({ ...communityDesign, churchName: e.target.value })} placeholder="은혜교회 청년부" style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem' }} />
                    </label>
                    <label style={{ display: 'grid', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>워십 라벨</span>
                      <input type="text" value={communityDesign.worshipLabel || ''} onChange={(e) => setCommunityDesign({ ...communityDesign, worshipLabel: e.target.value })} placeholder="WORSHIP" style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem' }} />
                    </label>
                    <label style={{ display: 'grid', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>홈페이지 URL (하단)</span>
                      <input type="text" value={communityDesign.homepage || ''} onChange={(e) => setCommunityDesign({ ...communityDesign, homepage: e.target.value })} placeholder="https://..." style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem' }} />
                    </label>
                    <label style={{ display: 'grid', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>푸터 문구</span>
                      <input type="text" value={communityDesign.footer || ''} onChange={(e) => setCommunityDesign({ ...communityDesign, footer: e.target.value })} placeholder="KCIS · 싱가폴한인교회" style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem' }} />
                    </label>
                  </div>
                  {designMsg && <p style={{ margin: 0, fontSize: '0.82rem', color: designMsg.includes('실패') ? 'var(--color-danger)' : 'var(--color-primary-deep)' }}>{designMsg}</p>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setPreviewBulletin({ design: communityDesign, content: communityContent })} style={{ padding: '0.55rem 1rem', borderRadius: 10, border: '1px solid var(--color-primary)', background: '#fff', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>👁 주보 템플릿 미리보기</button>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button type="button" disabled={designSaving} onClick={() => saveCommunityDesign(false)} style={{ padding: '0.55rem 1rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.85rem', cursor: designSaving ? 'not-allowed' : 'pointer' }}>저장</button>
                      <button type="button" disabled={designSaving} onClick={() => saveCommunityDesign(true)} style={{ padding: '0.55rem 1rem', borderRadius: 10, border: 'none', background: designSaving ? 'rgba(32, 205, 141, 0.5)' : 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: designSaving ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-button)' }}>📝 저장 + 모든 예배에 적용</button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeMenu === '예배관리' && (
              <section style={{ padding: isMobile ? '1rem' : '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.2rem', color: 'var(--color-ink)' }}>주보관리</h2>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>예배일정 수정/삭제는 일정관리에서 가능합니다</p>
                <div style={{ padding: '1rem 1.1rem', borderRadius: 14, background: '#F9FCFB', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.65rem' }}>
                  {wsModalOpen && (
                    <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#fff', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--color-primary-deep)' }}>새 예배 일정</strong>
                        <button type="button" onClick={() => setWsModalOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', color: 'var(--color-ink-2)' }}>✕</button>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <label style={{ display: 'grid', gap: '0.25rem', width: isMobile ? '100%' : 120 }}>
                          <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>예배이름</span>
                          {(() => {
                            const presets = ['주일예배', '수요예배', '금요예배', '새벽예배', '구역예배'];
                            const isCustom = !presets.includes(wsForm.name);
                            const selectValue = isCustom ? '__custom__' : wsForm.name;
                            return (
                              <>
                                <select
                                  value={selectValue}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === '__custom__') setWsForm({ ...wsForm, name: '' });
                                    else setWsForm({ ...wsForm, name: v });
                                  }}
                                  style={{ padding: '0.55rem 0.6rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem', color: 'var(--color-ink)', width: '100%', boxSizing: 'border-box', background: '#fff' }}
                                >
                                  {presets.map((p) => <option key={p} value={p}>{p}</option>)}
                                  <option value="__custom__">직접입력</option>
                                </select>
                                {isCustom && (
                                  <input
                                    type="text"
                                    value={wsForm.name}
                                    onChange={(e) => setWsForm({ ...wsForm, name: e.target.value })}
                                    placeholder="예배 이름을 입력하세요"
                                    autoFocus
                                    style={{ padding: '0.5rem 0.6rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem', color: 'var(--color-ink)', width: '100%', boxSizing: 'border-box' }}
                                  />
                                )}
                              </>
                            );
                          })()}
                        </label>
                        <div style={{ display: 'grid', gap: '0.25rem', width: isMobile ? '100%' : 160 }}>
                          <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>예배일자</span>
                          <DateTimePicker
                            value={wsForm.startAt}
                            onChange={(v) => setWsForm({ ...wsForm, startAt: v })}
                            placeholder="날짜·시간 선택"
                            style={{ flex: 'none', minWidth: 0, width: '100%' }}
                          />
                        </div>
                        <label style={{ display: 'grid', gap: '0.25rem', flex: 1, minWidth: 140 }}>
                          <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>장소</span>
                          <input
                            type="text"
                            value={wsForm.location}
                            onChange={(e) => setWsForm({ ...wsForm, location: e.target.value })}
                            placeholder="예배장소 (선택)"
                            style={{ padding: '0.55rem 0.6rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem', color: 'var(--color-ink)', width: '100%', boxSizing: 'border-box' }}
                          />
                        </label>
                        {(() => {
                          const tpls = worshipServices.filter((s) => !!s.bulletin);
                          return (
                            <div style={{ display: 'grid', gap: '0.25rem', width: isMobile ? '100%' : 140 }}>
                              <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 700 }}>주보템플릿</span>
                              <select
                                value={worshipTemplateId}
                              onChange={(e) => { const v = e.target.value; setWorshipTemplateId(v); setWsForm({ ...wsForm, generateBulletin: !!v }); }}
                              style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem', color: 'var(--color-ink)', background: '#fff', width: '100%', boxSizing: 'border-box' }}
                            >
                              <option value="">주보 사용 안함</option>
                              {tpls.map((s) => {
                                const isDef = (s as any).isDefault || s.name === '주일예배';
                                return <option key={s.id} value={s.id}>{s.name}{isDef ? ' (기본)' : ''}</option>;
                              })}
                            </select>
                          </div>
                        );
                      })()}
                      </div>
                      <div style={{ display: 'grid', gap: '0.4rem', padding: '0.6rem 0.75rem', borderRadius: 10, background: '#F8FAFC', border: '1px solid var(--color-surface-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-ink)' }}>예배 반복</span>
                          <label style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                            <input type="radio" name="wsRecurToggle" checked={wsRecurType !== 'none'} onChange={() => setWsRecurType('weekly')} /> 반복함
                          </label>
                          <label style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                            <input type="radio" name="wsRecurToggle" checked={wsRecurType === 'none'} onChange={() => setWsRecurType('none')} /> 반복 안함 <span style={{ color: 'var(--color-ink-2)', fontWeight: 500, fontSize: '0.78rem' }}>(1회만 생성)</span>
                          </label>
                        </div>
                        {wsRecurType !== 'none' && (() => {
                          const unit = wsRecurType === 'custom' ? wsRecurUnit : wsRecurType;
                          const worshipMax = unit === 'daily' ? 365 : unit === 'weekly' || unit === 'week' ? 52 : 12;
                          const startDate = wsForm.startAt ? new Date(wsForm.startAt) : new Date();
                          const oneYearLater = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
                          const pad2 = (n: number) => String(n).padStart(2, '0');
                          const maxUntil = `${oneYearLater.getFullYear()}-${pad2(oneYearLater.getMonth() + 1)}-${pad2(oneYearLater.getDate())}`;
                          return (
                            <>
                              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                {([['daily', '매일'], ['weekly', '매주'], ['monthly', '매월']] as const).map(([v, label]) => (
                                  <button key={v} type="button" onClick={() => setWsRecurType(v)} style={{ padding: '0.35rem 0.75rem', borderRadius: 999, border: wsRecurType === v ? '1px solid var(--color-primary)' : '1px solid var(--color-gray)', background: wsRecurType === v ? 'var(--color-primary-tint)' : '#fff', color: wsRecurType === v ? 'var(--color-primary-deep)' : 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>{label}</button>
                                ))}
                                <button type="button" onClick={() => setWsRecurType('custom')} style={{ padding: '0.35rem 0.75rem', borderRadius: 999, border: wsRecurType === 'custom' ? '1px solid var(--color-primary)' : '1px solid var(--color-gray)', background: wsRecurType === 'custom' ? 'var(--color-primary-tint)' : '#fff', color: wsRecurType === 'custom' ? 'var(--color-primary-deep)' : 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>사용자지정</button>
                                {wsRecurType === 'custom' && (
                                  <select value={wsRecurUnit} onChange={(e) => setWsRecurUnit(e.target.value as any)} style={{ padding: '0.35rem 0.55rem', borderRadius: 8, border: '1px solid var(--color-primary)', background: '#fff', color: 'var(--color-primary-deep)', fontWeight: 700, fontSize: '0.8rem' }}>
                                    <option value="week">매주</option>
                                    <option value="month">매월</option>
                                  </select>
                                )}
                              </div>
                              {wsRecurType === 'custom' && wsRecurUnit === 'week' && (
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)', marginRight: '0.3rem' }}>요일</span>
                                  {[['일', 0], ['월', 1], ['화', 2], ['수', 3], ['목', 4], ['금', 5], ['토', 6]].map(([label, val]) => {
                                    const v = val as number;
                                    const on = wsRecurDays.includes(v);
                                    return (
                                      <button key={v} type="button" onClick={() => setWsRecurDays(on ? wsRecurDays.filter((d) => d !== v) : [...wsRecurDays, v].sort())} style={{ width: 30, height: 30, borderRadius: 999, border: on ? '1px solid var(--color-primary)' : '1px solid var(--color-gray)', background: on ? 'var(--color-primary-tint)' : '#fff', color: v === 0 ? '#dc2626' : v === 6 ? '#2563eb' : 'var(--color-ink)', fontWeight: on ? 800 : 600, fontSize: '0.78rem', cursor: 'pointer' }}>{label}</button>
                                    );
                                  })}
                                </div>
                              )}
                              {wsRecurType === 'custom' && wsRecurUnit === 'month' && (() => {
                                const refDate = wsForm.startAt ? new Date(wsForm.startAt) : new Date();
                                const targetDow = refDate.getDay();
                                const lastDate = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
                                let dowCount = 0;
                                for (let dd = 1; dd <= lastDate; dd++) {
                                  if (new Date(refDate.getFullYear(), refDate.getMonth(), dd).getDay() === targetDow) dowCount++;
                                }
                                const weeks = dowCount >= 5 ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
                                return (
                                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {weeks.map((w) => {
                                      const on = wsRecurWeeks.includes(w);
                                      return (
                                        <button key={w} type="button" onClick={() => setWsRecurWeeks(on ? wsRecurWeeks.filter((x) => x !== w) : [...wsRecurWeeks, w].sort())} style={{ padding: '0.3rem 0.6rem', borderRadius: 999, border: on ? '1px solid var(--color-primary)' : '1px solid var(--color-gray)', background: on ? 'var(--color-primary-tint)' : '#fff', color: on ? 'var(--color-primary-deep)' : 'var(--color-ink-2)', fontWeight: on ? 800 : 600, fontSize: '0.78rem', cursor: 'pointer' }}>{['첫째주', '둘째주', '셋째주', '넷째주', '다섯째주'][w - 1]}</button>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
                              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <label style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                                  <input type="radio" name="wsRecurEnd" checked={wsRecurEndType === 'count'} onChange={() => setWsRecurEndType('count')} /> 횟수
                                </label>
                                <input type="number" min={1} max={worshipMax} value={wsRecurCount} onChange={(e) => setWsRecurCount(Math.max(1, Math.min(worshipMax, Number(e.target.value) || 1)))} disabled={wsRecurEndType !== 'count'} style={{ width: 80, padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem' }} />
                                <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>회</span>
                                <label style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--color-ink)', cursor: 'pointer' }}>
                                  <input type="radio" name="wsRecurEnd" checked={wsRecurEndType === 'until'} onChange={() => setWsRecurEndType('until')} /> 날짜까지
                                </label>
                                <input type="date" value={wsRecurUntil} max={maxUntil} onChange={(e) => { let v = e.target.value; if (v > maxUntil) v = maxUntil; setWsRecurUntil(v); }} disabled={wsRecurEndType !== 'until'} style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem' }} />
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {wsMsg && <p style={{ margin: 0, fontSize: '0.82rem', color: wsMsg.includes('등록') ? 'var(--color-primary-deep)' : 'var(--color-danger)' }}>{wsMsg}</p>}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button type="button" onClick={() => setWsModalOpen(false)} style={{ padding: '0.5rem 0.95rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>취소</button>
                        <button
                          type="button"
                          disabled={wsCreating || !mgmtCommunityId}
                          onClick={createWorshipService}
                          style={{ padding: '0.5rem 0.95rem', borderRadius: 'var(--radius-lg)', border: 'none', background: wsCreating ? 'rgba(32, 205, 141, 0.5)' : 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: wsCreating ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-button)' }}
                        >
                          {wsCreating ? '생성 중…' : '저장'}
                        </button>
                      </div>
                    </div>
                  )}
                  {worshipView === 'calendar' ? (() => {
                    const services = worshipServices.filter((s) => s.startAt);
                    const byDay = new Map<string, typeof services>();
                    for (const s of services) {
                      const d = new Date(s.startAt);
                      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      if (!byDay.has(k)) byDay.set(k, []);
                      byDay.get(k)!.push(s);
                    }
                    const now = new Date();
                    const year = now.getFullYear();
                    const monthIdx = now.getMonth();
                    const firstOffset = new Date(year, monthIdx, 1).getDay();
                    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
                    const cells: Array<{ date: Date; key: string } | null> = [];
                    for (let i = 0; i < firstOffset; i++) cells.push(null);
                    for (let d = 1; d <= daysInMonth; d++) {
                      const dt = new Date(year, monthIdx, d);
                      cells.push({ date: dt, key: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
                    }
                    while (cells.length % 7 !== 0) cells.push(null);
                    const todayKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    return (
                      <div style={{ display: 'grid', gap: '0.5rem', padding: '0.75rem', borderRadius: 12, background: '#fff', border: '1px solid var(--color-surface-border)' }}>
                        <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-ink)' }}>{year}년 {monthIdx + 1}월</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                          {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
                            <span key={w} style={{ textAlign: 'center', fontSize: '0.74rem', fontWeight: 700, color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--color-ink-2)', padding: '0.2rem 0' }}>{w}</span>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                          {cells.map((cell, idx) => {
                            if (!cell) return <span key={idx} />;
                            const dayServices = byDay.get(cell.key) || [];
                            const has = dayServices.length > 0;
                            const isToday = cell.key === todayKey;
                            const dow = cell.date.getDay();
                            return (
                              <div key={idx} style={{ minHeight: 56, padding: '0.25rem', borderRadius: 6, border: isToday ? '1.5px solid var(--color-primary)' : '1px solid var(--color-surface-border)', background: has ? '#CCF4E5' : '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.74rem', fontWeight: isToday ? 800 : 600, color: dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink)' }}>
                                  <span>{cell.date.getDate()}</span>
                                  {isToday && <span style={{ fontSize: '0.54rem', fontWeight: 800, color: '#fff', background: 'var(--color-primary)', padding: '0.04rem 0.26rem', borderRadius: 999, lineHeight: 1 }}>오늘</span>}
                                </span>
                                {dayServices.map((s) => {
                                  const isStub = !s.bulletin && !!s.bulletinTemplateId;
                                  const isPublished = !!(s as any).published;
                                  const isEdited = !!s.bulletin && !isPublished;
                                  const isUnused = !s.bulletin && !s.bulletinTemplateId && !(s as any).isDefault;
                                  let bg = '#20CD8D', fg = '#fff', statusChar = '';
                                  if (isUnused) { bg = '#F1F5F9'; fg = 'var(--color-ink-2)'; statusChar = '–'; }
                                  else if (isStub) { bg = '#FEF3C7'; fg = '#92400E'; statusChar = '!'; }
                                  else if (isEdited) { bg = '#DBEAFE'; fg = '#1E40AF'; statusChar = '✎'; }
                                  else if (isPublished) { bg = '#20CD8D'; fg = '#fff'; statusChar = '✓'; }
                                  const title = isUnused ? `${s.name} · 주보 사용안함`
                                    : isStub ? `${s.name} · 수정필요`
                                    : isEdited ? `${s.name} · 편집중`
                                    : isPublished ? `${s.name} · 배포중`
                                    : s.name;
                                  return (
                                    <button key={s.id} type="button" title={title} onClick={() => { setEditingService(s); setEditingBulletin(s.bulletin ? JSON.parse(JSON.stringify(s.bulletin)) : (s.resolvedBulletin ? JSON.parse(JSON.stringify(s.resolvedBulletin)) : {})); }} style={{ padding: '1px 4px', borderRadius: 4, border: 'none', background: bg, color: fg, fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {statusChar && <span style={{ marginRight: 2 }}>{statusChar}</span>}⛪ {s.name}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })() : (() => {
                    const pageSize = 5;
                    const nowMsList = Date.now();
                    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
                    const sorted = worshipServices
                      .filter((s) => s.startAt && new Date(s.startAt).getTime() >= todayStart.getTime())
                      .slice()
                      .sort((a, b) => a.startAt.localeCompare(b.startAt));
                    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
                    const page = Math.min(worshipListPage, totalPages);
                    const start = (page - 1) * pageSize;
                    const items = sorted.slice(start, start + pageSize);
                    return (
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {sorted.length === 0 ? (
                          <p style={{ margin: 0, padding: '0.75rem', fontSize: '0.85rem', color: 'var(--color-ink-2)', textAlign: 'center', background: '#fff', borderRadius: 10, border: '1px solid var(--color-surface-border)' }}>등록된 예배 일정이 없습니다.</p>
                        ) : (
                          <>
                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                              <div style={{ display: isMobile ? 'none' : 'grid', gridTemplateColumns: '150px minmax(100px, 1fr) 110px 170px', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.85rem', background: '#F1F5F9', borderRadius: 8, fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>
                                <span>예배 날짜·시간</span>
                                <span>예배 이름</span>
                                <span>주보</span>
                                <span style={{ textAlign: 'right' }}>액션</span>
                              </div>
                              {items.map((s) => {
                                const d = new Date(s.startAt);
                                const when = d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' });
                                const inUse = !!s.bulletin;
                                const preview = s.bulletin ?? s.resolvedBulletin;
                                const isDefault = (s as any).isDefault;
                                return (
                                  <div key={s.id} style={isMobile ? { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: 10, background: '#fff', border: '1px solid var(--color-surface-border)' } : { display: 'grid', gridTemplateColumns: '150px minmax(100px, 1fr) 110px 170px', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.85rem', borderRadius: 10, background: '#fff', border: '1px solid var(--color-surface-border)' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>{when}</span>
                                    <span style={{ fontWeight: 700, color: 'var(--color-ink)', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                                    <button
                                      type="button"
                                      disabled={isDefault && inUse}
                                      onClick={() => !isDefault && toggleBulletinUsage(s, !inUse)}
                                      style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', cursor: isDefault ? 'not-allowed' : 'pointer', padding: 0, border: 'none', background: 'transparent', width: '100%' }}
                                    >
                                      <span style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, borderRadius: 999, background: inUse ? 'var(--color-primary)' : '#cbd5d0', transition: 'background 0.15s', flexShrink: 0 }}>
                                        <span style={{ position: 'absolute', top: 2, left: inUse ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s' }} />
                                      </span>
                                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: inUse ? 'var(--color-primary-deep)' : 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{inUse ? '사용함' : '사용안함'}</span>
                                    </button>
                                    <div style={{ display: 'grid', gridTemplateColumns: '80px 70px', gap: '0.3rem', alignItems: 'center', justifyContent: 'end' }}>
                                      <span style={{ justifySelf: 'end' }}>
                                        {inUse ? (
                                          <button type="button" onClick={() => { setEditingService(s); setEditingBulletin(s.bulletin ? JSON.parse(JSON.stringify(s.bulletin)) : (s.resolvedBulletin ? JSON.parse(JSON.stringify(s.resolvedBulletin)) : {})); }} style={{ padding: '0.3rem 0.6rem', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{(s as any).published ? '미리보기' : '편집하기'}</button>
                                        ) : null}
                                      </span>
                                      <span style={{ justifySelf: 'end' }}>
                                        {inUse && (() => {
                                          const isPublished = !!(s as any).published;
                                          const hasBulletin = !!s.bulletin;
                                          const hasEdited = !!(s as any).editedAt;
                                          if (isPublished) return <span title="배포중" style={{ display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.4rem', borderRadius: 999, background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>📢 배포중</span>;
                                          if (hasBulletin && hasEdited) return <span title="편집중" style={{ display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.4rem', borderRadius: 999, background: '#DBEAFE', color: '#1E40AF', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>✎ 편집중</span>;
                                          if (hasBulletin) return <span title="기본주보" style={{ display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.4rem', borderRadius: 999, background: '#F1F5F9', color: 'var(--color-ink-2)', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>📋 기본주보</span>;
                                          return <span title="주보없음" style={{ display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.4rem', borderRadius: 999, background: '#FEF3C7', color: '#92400E', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>! 주보없음</span>;
                                        })()}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {totalPages > 1 && (
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                                <button type="button" onClick={() => setWorshipListPage(Math.max(1, page - 1))} disabled={page === 1} style={{ padding: '0.3rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.82rem', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}>‹ 이전</button>
                                <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>{page} / {totalPages}</span>
                                <button type="button" onClick={() => setWorshipListPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ padding: '0.3rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.82rem', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}>다음 ›</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}

            {previewBulletin && (
              <WorshipBulletinPreview value={previewBulletin} onClose={() => setPreviewBulletin(null)} />
            )}

            {duplicateSource && (
              <div onClick={() => { if (!duplicateSaving) { setDuplicateSource(null); setDuplicateName(''); } }} style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                <div role="dialog" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '1rem', color: 'var(--color-primary-deep)' }}>템플릿 복제</strong>
                    <button type="button" onClick={() => { setDuplicateSource(null); setDuplicateName(''); }} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--color-ink-2)' }}>✕</button>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>원본: <strong style={{ color: 'var(--color-ink)' }}>{duplicateSource.name}</strong></p>
                  <label style={{ display: 'grid', gap: '0.3rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 700 }}>새 템플릿 이름</span>
                    <input
                      type="text"
                      value={duplicateName}
                      onChange={(e) => setDuplicateName(e.target.value)}
                      autoFocus
                      placeholder="예: 청년예배"
                      style={{ padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.92rem', color: 'var(--color-ink)' }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !duplicateSaving) submitDuplicate(); }}
                    />
                  </label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button type="button" disabled={duplicateSaving} onClick={() => { setDuplicateSource(null); setDuplicateName(''); }} style={{ padding: '0.5rem 1rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, cursor: duplicateSaving ? 'not-allowed' : 'pointer' }}>취소</button>
                    <button type="button" disabled={duplicateSaving || !duplicateName.trim()} onClick={submitDuplicate} style={{ padding: '0.5rem 1.1rem', borderRadius: 10, border: 'none', background: duplicateSaving || !duplicateName.trim() ? 'rgba(32, 205, 141, 0.5)' : 'var(--color-primary)', color: '#fff', fontWeight: 800, cursor: duplicateSaving || !duplicateName.trim() ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-button)' }}>
                      {duplicateSaving ? '생성 중...' : '생성'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editingService && (
              <div onClick={() => { if (window.confirm('편집을 종료하시겠습니까? 저장하지 않은 변경사항은 사라집니다.')) { setEditingService(null); setEditingBulletin(null); } }} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
                <div role="dialog" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, background: '#fff', borderRadius: 16, boxShadow: 'var(--shadow-card-lg)', padding: isMobile ? '1rem' : '1.25rem', display: 'grid', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>주보 편집 · {editingService.name}</h3>
                    <button type="button" onClick={() => { setEditingService(null); setEditingBulletin(null); }} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                  </div>
                  <WorshipBulletinEditor
                    value={editingBulletin || {}}
                    onChange={(next) => setEditingBulletin(next)}
                    onPublish={async () => {
                      if (!editingService || !mgmtCommunityId) return;
                      if (!window.confirm('이 주보를 공동체에 배포하시겠습니까?\n(현재 편집 내용을 저장하고 알림에 표시됩니다.)')) return;
                      try {
                        const res = await fetch(`/api/communities/${encodeURIComponent(mgmtCommunityId)}/worship-services`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ serviceId: editingService.id, bulletin: editingBulletin, published: true, markEdited: true }),
                        });
                        if (!res.ok) throw new Error('배포에 실패했습니다.');
                        const d = await res.json();
                        setWorshipServices((prev) => prev.map((s) => s.id === editingService.id ? d.service : s));
                        window.alert('공동체에 배포되었습니다.');
                        setEditingService(null);
                        setEditingBulletin(null);
                      } catch (e: any) {
                        window.alert(e?.message || '배포 실패');
                      }
                    }}
                    isPublished={Boolean((editingService as any)?.published)}
                    onUnpublish={async () => {
                      if (!editingService || !mgmtCommunityId) return;
                      if (!window.confirm('배포를 회수하시겠습니까?\n(편집중 상태로 돌아가며 멤버에게 표시되지 않습니다.)')) return;
                      try {
                        const res = await fetch(`/api/communities/${encodeURIComponent(mgmtCommunityId)}/worship-services`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ serviceId: editingService.id, published: false }),
                        });
                        if (!res.ok) throw new Error('회수에 실패했습니다.');
                        const d = await res.json();
                        setWorshipServices((prev) => prev.map((s) => s.id === editingService.id ? d.service : s));
                        setEditingService(d.service);
                        window.alert('배포가 회수되었습니다.');
                      } catch (e: any) {
                        window.alert(e?.message || '회수 실패');
                      }
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', position: 'sticky', bottom: 0, background: '#fff', paddingTop: '0.5rem', borderTop: '1px solid var(--color-surface-border)' }}>
                    <button type="button" onClick={() => { setEditingService(null); setEditingBulletin(null); }} style={{ padding: '0.55rem 1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, cursor: 'pointer' }}>취소</button>
                    <button type="button" disabled={editingSaving} onClick={saveServiceBulletin} style={{ padding: '0.55rem 1.1rem', borderRadius: 'var(--radius-lg)', border: 'none', background: editingSaving ? 'rgba(32, 205, 141, 0.5)' : 'var(--color-primary)', color: '#fff', fontWeight: 800, cursor: editingSaving ? 'not-allowed' : 'pointer', boxShadow: 'var(--shadow-button)' }}>
                      {editingSaving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeMenu === '기타설정' && (
            <section style={{ padding: isMobile ? '1rem' : '1.5rem', borderRadius: 28, background: '#ffffff', boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.5rem', color: '#0f172a' }}>기타 설정</h2>

              {profileId ? (
                scopedAdminCommunities.length > 0 ? (
                  <div style={{ display: 'grid', gap: '1rem' }}>
                    {scopedAdminCommunities.map((community) => (
                      <table key={community.id} style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: 16, border: '1px solid rgba(59, 130, 246, 0.14)' }}>
                        <colgroup>
                          <col style={{ width: '30%' }} />
                          <col style={{ width: '50%' }} />
                          <col style={{ width: '20%' }} />
                        </colgroup>
                        <tbody>
                          <tr>
                            <td style={{ color: '#334155', fontSize: '0.95rem', fontWeight: 600, verticalAlign: 'middle', padding: '0.5rem 0.5rem' }}>가입 처리 방식</td>
                            <td style={{ padding: '0.5rem 0.5rem', verticalAlign: 'middle' }}>
                              <select
                                value={settings[community.id] || 'auto'}
                                onChange={(event) => handleSettingChange(community.id, event.target.value as 'auto' | 'admin')}
                                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 12, border: '1px solid rgba(148, 163, 184, 0.4)', background: '#ffffff', color: '#0f172a' }}
                              >
                                <option value="auto">승인 없이 가입완료 (기본)</option>
                                <option value="admin">관리자 승인 후 가입완료</option>
                              </select>
                            </td>
                            <td style={{ padding: '0.5rem 0.5rem', verticalAlign: 'middle', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => saveSettings(community.id)}
                                disabled={savingCommunityId === community.id}
                                style={{ padding: '0.65rem 1.1rem', borderRadius: 14, background: '#0ea5e9', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                저장
                              </button>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ color: '#334155', fontSize: '0.95rem', fontWeight: 600, verticalAlign: 'middle', padding: '0.5rem 0.5rem' }}>실명사용</td>
                            <td style={{ padding: '0.5rem 0.5rem', verticalAlign: 'middle' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '1rem', fontSize: '0.9rem', color: '#0f172a', cursor: 'pointer' }}>
                                <input type="radio" name={`realName-${community.id}`} checked={realNameSettings[community.id] === true} onChange={() => handleRealNameChange(community.id, true)} /> 예
                              </label>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', color: '#0f172a', cursor: 'pointer' }}>
                                <input type="radio" name={`realName-${community.id}`} checked={realNameSettings[community.id] === false} onChange={() => handleRealNameChange(community.id, false)} /> 아니오
                              </label>
                            </td>
                            <td style={{ padding: '0.5rem 0.5rem', verticalAlign: 'middle', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => saveRealName(community.id)}
                                disabled={savingRealNameId === community.id}
                                style={{ padding: '0.65rem 1.1rem', borderRadius: 14, background: '#0ea5e9', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                저장
                              </button>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ color: '#334155', fontSize: '0.95rem', fontWeight: 600, verticalAlign: 'middle', padding: '0.5rem 0.5rem' }}>공동체 타임존</td>
                            <td style={{ padding: '0.5rem 0.5rem', verticalAlign: 'middle' }}>
                              <select
                                value={tzSettings[community.id] || 'Asia/Seoul'}
                                onChange={(e) => handleTzChange(community.id, e.target.value)}
                                style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 12, border: '1px solid rgba(148, 163, 184, 0.4)', background: '#ffffff', color: '#0f172a' }}
                              >
                                <option value="Asia/Seoul">한국 (Asia/Seoul)</option>
                                <option value="Asia/Singapore">싱가포르 (Asia/Singapore)</option>
                                <option value="Asia/Tokyo">일본 (Asia/Tokyo)</option>
                                <option value="Asia/Shanghai">중국 (Asia/Shanghai)</option>
                                <option value="America/Los_Angeles">미 서부 (America/Los_Angeles)</option>
                                <option value="America/New_York">미 동부 (America/New_York)</option>
                                <option value="America/Chicago">미 중부 (America/Chicago)</option>
                                <option value="Europe/London">영국 (Europe/London)</option>
                                <option value="Europe/Berlin">독일 (Europe/Berlin)</option>
                                <option value="Australia/Sydney">호주 (Australia/Sydney)</option>
                                <option value="UTC">UTC</option>
                              </select>
                            </td>
                            <td style={{ padding: '0.5rem 0.5rem', verticalAlign: 'middle', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => saveTimezone(community.id)}
                                disabled={savingTzId === community.id}
                                style={{ padding: '0.65rem 1.1rem', borderRadius: 14, background: '#0ea5e9', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                              >
                                저장
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ))}
                    {statusMessage && <p style={{ margin: 0, color: '#0f172a' }}>{statusMessage}</p>}
                  </div>
                ) : (
                  <div style={{ padding: '1rem', borderRadius: 22, background: '#ffffff', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
                    <p style={{ margin: 0, color: '#475569' }}>관리자 권한이 있는 공동체가 없습니다.</p>
                  </div>
                )
              ) : (
                <div style={{ padding: '1rem', borderRadius: 22, background: '#ffffff', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
                  <p style={{ margin: 0, color: '#475569' }}>로그인 후 이용해주세요.</p>
                </div>
              )}
            </section>
            )}

          </section>

      </AppShell>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<ManagementProps> = async (context) => {
  // 보안 가드: 비로그인 → '/', 권한 없는 로그인 → '/dashboard' 로 리다이렉트.
  // 시스템 관리자 OR 공동체 관리자만 통과.
  const guard = await requireAdminAccessSSR(context);
  if ('redirect' in guard) return guard;

  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const queryNickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const queryEmail = typeof context.query.email === 'string' ? context.query.email : null;

  const [communitiesArr, usersArr] = await Promise.all([
    getCommunities(),
    getUsers(),
  ]);

  const communities = communitiesArr as Community[];
  const users = usersArr as UserEntry[];

  // "다른 userId = 다른 사용자" 원칙 — profileId 엄격 매칭. email/nickname 교차 매칭 금지.
  const userEntries = profileId
    ? users.filter((entry) => entry.providerProfileId === profileId)
    : [];

  const joinedCommunityIds = profileId ? Array.from(new Set(userEntries.map((user) => user.communityId))) : [];
  const myNickname = queryNickname || userEntries[0]?.nickname || null;
  const myEmail = queryEmail || userEntries[0]?.profile?.kakao_account?.email || null;
  const joinedCommunities = communities
    .filter((community) => joinedCommunityIds.includes(community.id))
    .map((community) => ({
      ...community,
      isAdmin: !!profileId && community.adminProfileId === profileId,
    }));

  const adminCommunities = joinedCommunities.filter((community) => community.isAdmin);

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname: myNickname, email: myEmail });
  return { props: { profileId, joinedCommunities, adminCommunities, userEntries, systemAdminHref } };
};

export default ManagementPage;
