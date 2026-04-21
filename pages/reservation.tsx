import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import SubHeader from '../components/SubHeader';
import { Venue, Block, BlockGroup, dateKey, toMin as toMinLocal, computeBlockedSlotsForDate } from '../components/VenueGrid';
import RequiredInfoModal from '../components/RequiredInfoModal';
import ProfileModal from '../components/ProfileModal';
import DateTimePicker from '../components/DateTimePicker';
import { getSystemAdminHref } from '../lib/adminGuard';
import { useIsMobile } from '../lib/useIsMobile';
import { useRequireLogin } from '../lib/useRequireLogin';
import { expandOccurrences, EventRow as RawEventRow } from '../lib/recurrence';
import {
  getVenues,
  getVenueBlocks,
  getVenueBlockGroups,
  getSettings,
  getEvents,
  getProfiles,
  getUsers,
  getSystemAdmins,
} from '../lib/dataStore';

type Props = {
  venues: Venue[];
  blocks: Block[];
  groups: BlockGroup[];
  slotMin: number;
  availableStart: string;
  availableEnd: string;
  reservationLimitMode: 'unlimited' | 'perUser';
  reservationLimitPerUser: number;
  profileId: string | null;
  displayName: string | null;
  contact: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const DURATION_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type MeetingKind = '부서' | '구역' | '기타';

const ReservationPage = ({ venues, blocks, groups, slotMin, availableStart, availableEnd, reservationLimitMode, reservationLimitPerUser, profileId, displayName, contact, nickname, email, systemAdminHref }: Props) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  useRequireLogin(profileId);

  const [effectiveProfileId, setEffectiveProfileId] = useState<string | null>(profileId);
  const [missingFields, setMissingFields] = useState<Array<'realName' | 'contact'>>([]);
  const [showRequiredModal, setShowRequiredModal] = useState(false);

  // 예약자 정보
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(displayName);
  const [currentContact, setCurrentContact] = useState<string | null>(contact);
  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ realName?: string; contact?: string }>).detail;
      if (detail?.realName) setCurrentDisplayName(detail.realName);
      if (detail?.contact) setCurrentContact(detail.contact);
    };
    window.addEventListener('kcis-profile-updated', onProfileUpdated);
    return () => window.removeEventListener('kcis-profile-updated', onProfileUpdated);
  }, []);

  // 모임구분
  const [meetingKind, setMeetingKind] = useState<MeetingKind>('부서');
  const [meetingDetail, setMeetingDetail] = useState('');

  // 예약 시간·장소 (picker 상태가 곧 source of truth)
  const [pickerDate, setPickerDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return dateKey(d);
  });
  const [pickerStartHour, setPickerStartHour] = useState<number>(() => Math.floor(toMinLocal(availableStart) / 60));
  const [pickerStartMin, setPickerStartMin] = useState<number>(() => toMinLocal(availableStart) % 60);
  const [pickerDurationHours, setPickerDurationHours] = useState<number>(1);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(() => new Set());

  // 모달 (두 개로 분리)
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);

  // 예약 확인 체크박스
  const [confirmMember, setConfirmMember] = useState(false);
  const [confirmInfo, setConfirmInfo] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const allConfirmed = confirmMember && confirmInfo && confirmCancel;

  // Shake 트리거
  const [profileShake, setProfileShake] = useState(false);
  const [meetingShake, setMeetingShake] = useState(false);
  const [timeShake, setTimeShake] = useState(false);
  const [venueShake, setVenueShake] = useState(false);
  const [confirmShake, setConfirmShake] = useState(false);
  const shake = (setter: (v: boolean) => void) => { setter(true); setTimeout(() => setter(false), 650); };

  // 예약 제출
  const [resvSubmitting, setResvSubmitting] = useState(false);
  const [resvError, setResvError] = useState<string | null>(null);

  // 첫 방문 onboarding (localStorage `kcis-reservation-tour-v1`이 없으면 보여줌)
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    try {
      if (!window.localStorage.getItem('kcis-reservation-tour-v1')) setShowOnboarding(true);
    } catch {}
  }, []);
  const dismissOnboarding = () => {
    setShowOnboarding(false);
    try { window.localStorage.setItem('kcis-reservation-tour-v1', '1'); } catch {}
  };

  // perUser 한도
  type MyReservation = {
    id: string;
    seriesId: string;
    occurrenceDate?: string;
    title: string;
    description?: string;
    startAt: string;
    endAt: string;
    location?: string;
    venueId?: string;
  };
  const [myFutureReservations, setMyFutureReservations] = useState<MyReservation[] | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [limitActionBusy, setLimitActionBusy] = useState(false);

  // 층별 그룹핑
  const venuesByFloor = useMemo(() => {
    const gMap = new Map<string, Venue[]>();
    for (const v of venues) {
      if (!gMap.has(v.floor)) gMap.set(v.floor, []);
      gMap.get(v.floor)!.push(v);
    }
    const entries = Array.from(gMap.entries());
    entries.sort(([a], [b]) => {
      const fa = Number((a.match(/(\d+)/) || [])[1] || 0);
      const fb = Number((b.match(/(\d+)/) || [])[1] || 0);
      return fa - fb;
    });
    for (const [, list] of entries) list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return entries;
  }, [venues]);

  // 현재 picker 시간과 겹치는 기존 예약/블럭 있는 장소
  const conflictedPickerVenueIds = useMemo(() => {
    const out = new Set<string>();
    const [py, pm, pd] = pickerDate.split('-').map(Number);
    if (!py || !pm || !pd) return out;
    const pickerStartTs = new Date(py, pm - 1, pd, pickerStartHour, pickerStartMin).getTime();
    const pickerEndTs = pickerStartTs + Math.round(pickerDurationHours * 60) * 60 * 1000;
    for (const b of blocks) {
      const bs = new Date(b.startAt).getTime();
      const be = b.endAt ? new Date(b.endAt).getTime() : Number.POSITIVE_INFINITY;
      if (bs < pickerEndTs && be > pickerStartTs) out.add(b.venueId);
    }
    const groupBlocked = computeBlockedSlotsForDate(groups, pickerDate);
    const startAbs = pickerStartHour * 60 + pickerStartMin;
    const endAbs = startAbs + Math.round(pickerDurationHours * 60);
    for (const [vid, slotSet] of groupBlocked.entries()) {
      for (let mm = startAbs; mm < endAbs; mm += slotMin) {
        if (slotSet.has(mm)) { out.add(vid); break; }
      }
    }
    return out;
  }, [blocks, groups, pickerDate, pickerStartHour, pickerStartMin, pickerDurationHours, slotMin]);

  // 시간이 바뀌면 충돌 장소 자동 해제
  useEffect(() => {
    setPickerSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (conflictedPickerVenueIds.has(id)) changed = true;
        else next.add(id);
      });
      return changed ? next : prev;
    });
  }, [conflictedPickerVenueIds]);

  // 시작시각·지속시간 범위 조정
  useEffect(() => {
    const endM = toMinLocal(availableEnd);
    const currentStart = pickerStartHour * 60 + pickerStartMin;
    const remain = (endM - currentStart) / 60;
    if (pickerDurationHours > remain) {
      const valid = DURATION_OPTIONS.filter((h) => h <= remain);
      if (valid.length > 0) setPickerDurationHours(valid[valid.length - 1]);
    }
  }, [pickerStartHour, pickerStartMin, availableEnd, pickerDurationHours]);

  // 장소 토글
  const togglePickerVenue = (id: string) => {
    if (conflictedPickerVenueIds.has(id)) return;
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleFloor = (floor: string) => setPickerSelected((prev) => {
    const next = new Set(prev);
    const floorIds = venues.filter((v) => v.floor === floor && !conflictedPickerVenueIds.has(v.id)).map((v) => v.id);
    if (floorIds.length === 0) return prev;
    const allOn = floorIds.every((id) => next.has(id));
    if (allOn) floorIds.forEach((id) => next.delete(id));
    else floorIds.forEach((id) => next.add(id));
    return next;
  });
  const selectAll = () => setPickerSelected(new Set(venues.filter((v) => !conflictedPickerVenueIds.has(v.id)).map((v) => v.id)));
  const clearAll = () => setPickerSelected(new Set());

  // 프로필 누락 체크
  useEffect(() => {
    let pid = profileId;
    if (!pid) {
      try { pid = window.localStorage.getItem('kcisProfileId'); } catch {}
    }
    if (!pid) return;
    setEffectiveProfileId(pid);
    (async () => {
      try {
        const res = await fetch(`/api/auth/missing-fields?profileId=${encodeURIComponent(pid!)}`);
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d.missingFields) && d.missingFields.length > 0) {
            setMissingFields(d.missingFields);
            setShowRequiredModal(true);
          }
        }
      } catch {}
    })();
  }, [profileId]);

  const loadMyFuture = async (pid: string): Promise<MyReservation[]> => {
    try {
      const res = await fetch(`/api/events?communityId=kcis&profileId=${encodeURIComponent(pid)}&type=reservation`);
      if (!res.ok) return [];
      const d = await res.json();
      const all = (d?.events || []) as any[];
      const now = Date.now();
      return all
        .filter((r) => new Date(r.endAt).getTime() > now)
        .map((r) => {
          const id = String(r.id || '');
          const colon = id.indexOf(':');
          const seriesId = colon > 0 ? id.slice(0, colon) : id;
          const occurrenceDate = colon > 0 ? id.slice(colon + 1) : undefined;
          return { id, seriesId, occurrenceDate, title: r.title, description: r.description, startAt: r.startAt, endAt: r.endAt, location: r.location, venueId: r.venueId } as MyReservation;
        })
        .sort((a, b) => a.startAt.localeCompare(b.startAt));
    } catch { return []; }
  };

  // perUser 한도 체크 (페이지 진입 시 초과 시 limit 모달)
  useEffect(() => {
    if (!effectiveProfileId) return;
    if (reservationLimitMode !== 'perUser') return;
    let cancelled = false;
    (async () => {
      const future = await loadMyFuture(effectiveProfileId);
      if (cancelled) return;
      setMyFutureReservations(future);
      if (future.length >= reservationLimitPerUser) setShowLimitModal(true);
    })();
    return () => { cancelled = true; };
  }, [effectiveProfileId, reservationLimitMode, reservationLimitPerUser]);

  const handleDeleteMine = async (item: MyReservation) => {
    if (!effectiveProfileId || limitActionBusy) return;
    if (!window.confirm(`"${item.title}" 예약을 삭제하시겠습니까?`)) return;
    setLimitActionBusy(true);
    try {
      const params = new URLSearchParams();
      params.set('id', item.seriesId);
      params.set('profileId', effectiveProfileId);
      if (item.occurrenceDate) {
        params.set('scope', 'one');
        params.set('occurrenceDate', item.occurrenceDate);
      } else {
        params.set('scope', 'all');
      }
      const res = await fetch(`/api/events?${params.toString()}`, { method: 'DELETE' });
      if (!res.ok) { alert('삭제에 실패했습니다.'); return; }
      const future = await loadMyFuture(effectiveProfileId);
      setMyFutureReservations(future);
      if (future.length < reservationLimitPerUser) setShowLimitModal(false);
    } finally {
      setLimitActionBusy(false);
    }
  };
  const startEditMine = (item: MyReservation) => { setEditingId(item.id); setEditTitle(item.title); };
  const cancelEditMine = () => { setEditingId(null); setEditTitle(''); };
  const saveEditMine = async (item: MyReservation) => {
    if (!effectiveProfileId || limitActionBusy) return;
    const trimmed = editTitle.trim();
    if (!trimmed) { alert('제목을 입력하세요.'); return; }
    if (trimmed === item.title) { cancelEditMine(); return; }
    setLimitActionBusy(true);
    try {
      const occurrenceDate = item.occurrenceDate || item.startAt.slice(0, 10);
      const res = await fetch('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId: item.seriesId,
          occurrenceDate,
          fields: { title: trimmed },
          profileId: effectiveProfileId,
        }),
      });
      if (!res.ok) { alert('수정에 실패했습니다.'); return; }
      setMyFutureReservations((prev) => (prev || []).map((r) => (r.id === item.id ? { ...r, title: trimmed } : r)));
      cancelEditMine();
    } finally {
      setLimitActionBusy(false);
    }
  };

  // 예약 제출: 전체 유효성 검증 + venue별 개별 row 생성
  const submitReservations = async () => {
    if (!effectiveProfileId) { window.location.href = '/auth/login'; return; }
    if (missingFields.length > 0) { setShowRequiredModal(true); return; }

    // 섹션별 유효성 (모두 체크해서 전부 shake)
    let ok = true;
    const effName = currentDisplayName || displayName;
    const effContact = currentContact || contact;
    if (!effName?.trim() || !effContact?.trim()) { shake(setProfileShake); ok = false; }
    if (!meetingDetail.trim()) { shake(setMeetingShake); ok = false; }
    if (pickerSelected.size === 0) { shake(setVenueShake); ok = false; }
    if (!allConfirmed) { shake(setConfirmShake); ok = false; }
    if (!ok) return;

    // 충돌 체크
    if (Array.from(pickerSelected).some((id) => conflictedPickerVenueIds.has(id))) {
      shake(setVenueShake);
      setResvError('선택한 시간에 예약불가인 장소가 포함되어 있습니다. 시간 또는 장소를 다시 확인해주세요.');
      return;
    }

    setResvSubmitting(true);
    setResvError(null);
    try {
      const [y, mo, d] = pickerDate.split('-').map(Number);
      const startMin = pickerStartHour * 60 + pickerStartMin;
      const endMin = startMin + Math.round(pickerDurationHours * 60);
      const startAt = new Date(y, mo - 1, d, Math.floor(startMin / 60), startMin % 60).toISOString();
      const endAt = new Date(y, mo - 1, d, Math.floor(endMin / 60), endMin % 60).toISOString();
      const selectedVenues = venues.filter((v) => pickerSelected.has(v.id));
      const detail = meetingDetail.trim();
      const description = `[${meetingKind}]${detail ? ' ' + detail : ''}`;
      // 제목은 '모임구분 상세' 자동 생성 (예: "부서 청년부" / "구역 3구역")
      const autoTitle = detail ? `${meetingKind} ${detail}` : meetingKind;

      for (const v of selectedVenues) {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId: 'kcis',
            profileId: effectiveProfileId,
            title: autoTitle,
            description,
            startAt, endAt,
            venueId: v.id,
            location: `${v.floor} ${v.name}(${v.code})`,
            scope: 'personal',
            type: 'reservation',
            createdByName: displayName || nickname || undefined,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setResvError(j.error || '예약 실패');
          setResvSubmitting(false);
          return;
        }
      }

      // 성공 요약
      const sh = String(Math.floor(startMin / 60)).padStart(2, '0');
      const sm = String(startMin % 60).padStart(2, '0');
      const eh = String(Math.floor(endMin / 60)).padStart(2, '0');
      const em = String(endMin % 60).padStart(2, '0');
      const summary = selectedVenues
        .map((v) => `• ${pickerDate} ${sh}:${sm}~${eh}:${em} · ${v.floor} ${v.name}`)
        .join('\n');
      alert(`예약이 완료되었습니다.\n\n${summary}\n\n나의 장소예약 페이지로 이동합니다.`);

      const qs = new URLSearchParams();
      if (effectiveProfileId) qs.set('profileId', effectiveProfileId);
      if (displayName) qs.set('nickname', displayName);
      if (email) qs.set('email', email);
      router.push(`/reservations/my${qs.toString() ? `?${qs.toString()}` : ''}`);
    } catch {
      setResvError('예약 중 오류가 발생했습니다.');
      setResvSubmitting(false);
    }
  };

  // 파생 표기값
  const pickerDateDow = (() => {
    const [y, m, d] = pickerDate.split('-').map(Number);
    if (!y || !m || !d) return 0;
    return new Date(y, m - 1, d).getDay();
  })();
  const dateDowLabel = WEEK_LABELS[pickerDateDow];
  const timeSummary = (() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const startMin = pickerStartHour * 60 + pickerStartMin;
    const endMin = startMin + Math.round(pickerDurationHours * 60);
    const [, m, d] = pickerDate.split('-');
    return `${m}/${d}(${dateDowLabel}) ${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}~${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
  })();
  const venueSummary = (() => {
    if (pickerSelected.size === 0) return null;
    const list = venues.filter((v) => pickerSelected.has(v.id));
    const first = `${list[0].floor} ${list[0].name}`;
    if (list.length === 1) return first;
    return `${first} 외 ${list.length - 1}곳`;
  })();

  // 타임라인 히트맵: pickerDate의 availableStart~End 구간에서 슬롯별 '충돌 장소 수'
  // (이벤트 + 예약 + 블럭 + 반복 블럭 그룹 모두 반영)
  const timelineCells = useMemo(() => {
    const startAbs = toMinLocal(availableStart);
    const endAbs = toMinLocal(availableEnd);
    const cells: Array<{ min: number; busyCount: number; isEvent: boolean; isSelected: boolean }> = [];
    const [py, pm, pd] = pickerDate.split('-').map(Number);
    const baseTs = (py && pm && pd) ? new Date(py, pm - 1, pd).getTime() : 0;
    const pickerStartAbs = pickerStartHour * 60 + pickerStartMin;
    const pickerEndAbs = pickerStartAbs + Math.round(pickerDurationHours * 60);
    const groupSlotMap = baseTs ? computeBlockedSlotsForDate(groups, pickerDate) : new Map<string, Set<number>>();
    for (let mm = startAbs; mm < endAbs; mm += slotMin) {
      const slotStart = baseTs + mm * 60 * 1000;
      const slotEnd = slotStart + slotMin * 60 * 1000;
      const busyVenues = new Set<string>();
      let hasEvent = false;
      for (const b of blocks) {
        const bs = new Date(b.startAt).getTime();
        const be = b.endAt ? new Date(b.endAt).getTime() : Number.POSITIVE_INFINITY;
        if (bs < slotEnd && be > slotStart) {
          busyVenues.add(b.venueId);
          if (b.kind === 'event') hasEvent = true;
        }
      }
      for (const [vid, slotSet] of groupSlotMap.entries()) {
        if (slotSet.has(mm)) busyVenues.add(vid);
      }
      const isSelected = mm >= pickerStartAbs && mm < pickerEndAbs;
      cells.push({ min: mm, busyCount: busyVenues.size, isEvent: hasEvent, isSelected });
    }
    return cells;
  }, [blocks, groups, pickerDate, pickerStartHour, pickerStartMin, pickerDurationHours, slotMin, availableStart, availableEnd]);

  // 각 장소의 '충돌 사유' — 이 시간에 어떤 이벤트/예약이 있는지 표시용
  const conflictReasonByVenue = useMemo(() => {
    const out = new Map<string, string>();
    const [py, pm, pd] = pickerDate.split('-').map(Number);
    if (!py || !pm || !pd) return out;
    const pickerStartTs = new Date(py, pm - 1, pd, pickerStartHour, pickerStartMin).getTime();
    const pickerEndTs = pickerStartTs + Math.round(pickerDurationHours * 60) * 60 * 1000;
    for (const b of blocks) {
      const bs = new Date(b.startAt).getTime();
      const be = b.endAt ? new Date(b.endAt).getTime() : Number.POSITIVE_INFINITY;
      if (bs < pickerEndTs && be > pickerStartTs) {
        const existing = out.get(b.venueId);
        const label = b.reason || (b.kind === 'event' ? '교회일정' : b.kind === 'reservation' ? '예약됨' : '블럭');
        if (!existing) out.set(b.venueId, label);
      }
    }
    return out;
  }, [blocks, pickerDate, pickerStartHour, pickerStartMin, pickerDurationHours]);

  // "같은 모임으로" 복사: 기존 예약에서 meetingKind/detail/venue 끌어와 현재 입력 복원
  const copyFromReservation = (r: { description?: string; location?: string; venueId?: string; startAt: string }) => {
    // description 파싱: "[부서] 청년부" 같은 패턴
    const desc = r.description || '';
    const km = desc.match(/^\[(부서|구역|기타)\]\s*(.*)$/);
    if (km) {
      setMeetingKind(km[1] as MeetingKind);
      setMeetingDetail(km[2].trim());
    }
    // venue 매칭 (venueId 우선, 없으면 location 텍스트로 fallback)
    const matchVenue = (() => {
      if (r.venueId) return venues.find((v) => v.id === r.venueId) || null;
      if (r.location) return venues.find((v) => r.location!.includes(`(${v.code})`)) || null;
      return null;
    })();
    if (matchVenue) setPickerSelected(new Set([matchVenue.id]));
    setShowLimitModal(false);
  };

  // 모바일 최적화 공통 상수
  const P = isMobile ? '0.9rem 0.85rem' : '1rem 1.1rem';
  const GAP = isMobile ? '0.75rem' : '1rem';
  const FS_LABEL = isMobile ? '0.92rem' : '0.95rem';
  const FS_TEXT = isMobile ? '0.9rem' : '0.92rem';
  const MIN_H = 44;
  const SHAKE_CSS = '@keyframes kcisShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }';

  return (
    <>
      <Head>
        <title>KCIS | 장소예약</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader
        profileId={profileId}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref}
      />

      <style>{SHAKE_CSS}</style>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '0.9rem 0.7rem 6rem' : '1.4rem 1rem 5rem', display: 'grid', gap: GAP }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.3rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>📍 장소 예약</h1>

        {/* 첫 방문 가이드 (한 번만) */}
        {showOnboarding && (
          <section style={{
            padding: isMobile ? '0.85rem 0.9rem' : '1rem 1.1rem',
            borderRadius: 14,
            background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)',
            border: '1px solid #A7F3D0',
            display: 'grid', gap: '0.5rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.05rem' }}>💡</span>
              <span style={{ fontSize: FS_LABEL, fontWeight: 800, color: '#065F46' }}>처음이신가요?</span>
              <button
                type="button"
                onClick={dismissOnboarding}
                aria-label="가이드 닫기"
                style={{
                  marginLeft: 'auto',
                  background: 'transparent', border: 'none',
                  fontSize: '1.1rem', color: '#065F46', cursor: 'pointer',
                  minWidth: 36, minHeight: 36,
                }}
              >✕</button>
            </div>
            <ol style={{ margin: 0, paddingLeft: '1.3rem', fontSize: isMobile ? '0.84rem' : '0.88rem', color: '#047857', lineHeight: 1.7 }}>
              <li><strong>예약자 정보</strong> 확인 (이름·연락처)</li>
              <li><strong>모임구분</strong> 선택 (부서 / 구역 / 기타) + 상세</li>
              <li><strong>시간·장소</strong> 선택 — 충돌 사전 확인</li>
              <li><strong>확인사항</strong> 체크 → <strong>예약하기</strong></li>
            </ol>
          </section>
        )}

        {/* 1. 예약자 정보 */}
        <section
          style={{
            padding: P,
            borderRadius: 14,
            background: '#FFF7ED',
            border: profileShake ? '2px solid #DC2626' : '1px solid #FED7AA',
            display: 'grid',
            gap: '0.55rem',
            animation: profileShake ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
            transition: 'border-color 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '1.05rem' }}>👤</span>
            <span style={{ fontSize: FS_LABEL, fontWeight: 800, color: '#9A3412' }}>예약자 정보</span>
            <span style={{ fontSize: '0.74rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>(클릭하여 수정)</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.55rem 0.9rem', minHeight: MIN_H,
                borderRadius: 999, background: '#FFEDD5', border: '1px solid #FED7AA',
                cursor: 'pointer', font: 'inherit', fontSize: FS_TEXT,
              }}
            >
              <span style={{ color: '#9A3412', fontWeight: 800, fontSize: '0.78rem' }}>이름</span>
              <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{currentDisplayName || displayName || '(미등록)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.55rem 0.9rem', minHeight: MIN_H,
                borderRadius: 999, background: '#FFEDD5', border: '1px solid #FED7AA',
                cursor: 'pointer', font: 'inherit', fontSize: FS_TEXT,
              }}
            >
              <span style={{ color: '#9A3412', fontWeight: 800, fontSize: '0.78rem' }}>연락처</span>
              <span style={{ color: 'var(--color-ink)', fontWeight: 700, fontFamily: 'monospace' }}>{currentContact || contact || '(미등록)'}</span>
            </button>
          </div>
        </section>

        {/* 2. 모임구분 */}
        <section
          style={{
            padding: P,
            borderRadius: 14,
            background: '#F7FEE7',
            border: meetingShake ? '2px solid #DC2626' : '1px solid #D9F09E',
            display: 'grid',
            gap: '0.55rem',
            animation: meetingShake ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
            transition: 'border-color 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '1.05rem' }}>👥</span>
            <span style={{ fontSize: FS_LABEL, fontWeight: 800, color: '#3F6212' }}>모임구분</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {(['부서', '구역', '기타'] as const).map((kind) => (
              <label
                key={kind}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.55rem 0.9rem', minHeight: MIN_H,
                  borderRadius: 999,
                  border: meetingKind === kind ? '1.5px solid #65A30D' : '1px solid var(--color-gray)',
                  background: meetingKind === kind ? '#ECFCCB' : '#fff',
                  cursor: 'pointer', fontSize: FS_TEXT,
                  fontWeight: meetingKind === kind ? 800 : 600,
                  color: meetingKind === kind ? '#3F6212' : 'var(--color-ink-2)',
                  flex: isMobile ? '1 1 30%' : '0 0 auto',
                  justifyContent: 'center',
                }}
              >
                <input type="radio" name="meetingKind" value={kind} checked={meetingKind === kind} onChange={() => setMeetingKind(kind)} style={{ margin: 0 }} />
                {kind}
              </label>
            ))}
          </div>
          <input
            type="text"
            value={meetingDetail}
            onChange={(e) => setMeetingDetail(e.target.value)}
            placeholder={meetingKind === '부서' ? '부서명 (예: 청년부)' : meetingKind === '구역' ? '구역명 (예: 3구역)' : '모임 상세'}
            style={{
              width: '100%',
              padding: '0.6rem 0.8rem', minHeight: MIN_H,
              borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: FS_TEXT,
              background: '#fff',
              boxSizing: 'border-box',
            }}
          />
        </section>

        {/* 3. 예약시간 */}
        <section
          style={{
            padding: P,
            borderRadius: 14,
            background: '#F7FEE7',
            border: timeShake ? '2px solid #DC2626' : '1px solid #D9F09E',
            display: 'grid',
            gap: '0.55rem',
            animation: timeShake ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
            transition: 'border-color 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.05rem' }}>⏰</span>
              <span style={{ fontSize: FS_LABEL, fontWeight: 800, color: '#3F6212' }}>예약시간</span>
            </div>
            <button
              type="button"
              onClick={() => setTimePickerOpen(true)}
              style={{
                padding: '0.5rem 0.95rem', minHeight: MIN_H,
                borderRadius: 999,
                border: '1px solid #65A30D',
                background: '#fff', color: '#3F6212',
                fontSize: '0.86rem', fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {timeSummary ? '변경' : '선택'}
            </button>
          </div>
          <div style={{
            padding: '0.7rem 0.85rem', borderRadius: 10,
            background: '#fff', border: '1px solid #D9F09E',
            fontSize: isMobile ? '0.95rem' : '1rem', fontWeight: 800, color: 'var(--color-ink)',
          }}>
            📅 {timeSummary}
          </div>
        </section>

        {/* 4. 장소 선택 */}
        <section
          style={{
            padding: P,
            borderRadius: 14,
            background: '#F7FEE7',
            border: venueShake ? '2px solid #DC2626' : '1px solid #D9F09E',
            display: 'grid',
            gap: '0.55rem',
            animation: venueShake ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
            transition: 'border-color 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.05rem' }}>📍</span>
              <span style={{ fontSize: FS_LABEL, fontWeight: 800, color: '#3F6212' }}>예약장소</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>({pickerSelected.size}/{venues.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setVenuePickerOpen(true)}
              style={{
                padding: '0.5rem 0.95rem', minHeight: MIN_H,
                borderRadius: 999,
                border: '1px solid #65A30D',
                background: '#fff', color: '#3F6212',
                fontSize: '0.86rem', fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {venueSummary ? '변경' : '선택'}
            </button>
          </div>
          <div style={{
            padding: '0.7rem 0.85rem', borderRadius: 10,
            background: venueSummary ? '#fff' : '#F9FAFB',
            border: venueSummary ? '1px solid #D9F09E' : '1px dashed var(--color-gray)',
            fontSize: isMobile ? '0.95rem' : '1rem',
            fontWeight: venueSummary ? 800 : 600,
            color: venueSummary ? 'var(--color-ink)' : 'var(--color-ink-2)',
          }}>
            {venueSummary ? `📍 ${venueSummary}` : '선택된 장소 없음 — 우측 “선택” 버튼을 눌러주세요'}
          </div>
        </section>

        {/* 5. 예약전 확인사항 */}
        <section
          style={{
            padding: P,
            borderRadius: 14,
            background: '#FEF3C7',
            border: confirmShake ? '2px solid #DC2626' : '1px solid #FBBF24',
            display: 'grid',
            gap: '0.5rem',
            animation: confirmShake ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
            transition: 'border-color 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '1.05rem' }}>⚠️</span>
            <span style={{ fontSize: FS_LABEL, fontWeight: 800, color: '#92400E' }}>예약전 확인사항</span>
          </div>
          {[
            { checked: confirmMember, setter: setConfirmMember, label: '싱가폴한인교회 등록교인입니다.' },
            { checked: confirmInfo, setter: setConfirmInfo, label: '실명과 연락가능한 번호를 올바르게 입력했습니다.' },
            { checked: confirmCancel, setter: setConfirmCancel, label: '잘못된 정보를 입력할 경우, 사전통보 없이 예약이 취소될 수 있음을 인지했습니다.' },
          ].map((item, i) => (
            <label key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.55rem',
              padding: '0.45rem 0',
              fontSize: isMobile ? '0.84rem' : '0.88rem',
              color: '#78350F', fontWeight: 700, lineHeight: 1.5, cursor: 'pointer',
            }}>
              <input type="checkbox" checked={item.checked} onChange={(e) => item.setter(e.target.checked)} style={{ marginTop: '0.25rem', accentColor: '#D97706', flexShrink: 0, width: 18, height: 18 }} />
              <span>{item.label}</span>
            </label>
          ))}
        </section>

        {/* 6. 예약하기 (데스크톱은 인라인 / 모바일은 스티키 바 추가) */}
        {!isMobile && (
          <section style={{ display: 'grid', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={submitReservations}
              disabled={resvSubmitting}
              style={{
                width: '100%',
                padding: '0.95rem 1rem', minHeight: 52,
                borderRadius: 14,
                border: 'none',
                background: resvSubmitting ? '#9CA3AF' : 'var(--color-primary)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '1.05rem',
                cursor: resvSubmitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(32,205,141,0.25)',
                letterSpacing: '0.02em',
              }}
            >
              {resvSubmitting ? '저장 중...' : '✓ 예약하기'}
            </button>
            {resvError && <p style={{ margin: 0, fontSize: '0.85rem', color: '#DC2626', fontWeight: 700, textAlign: 'center' }}>{resvError}</p>}
          </section>
        )}
      </main>

      {/* 모바일 스티키 예약하기 바 (스크롤 중에도 항상 하단 고정) */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '0.65rem 0.7rem calc(0.65rem + env(safe-area-inset-bottom))',
          background: 'rgba(255,255,255,0.96)',
          borderTop: '1px solid var(--color-surface-border)',
          boxShadow: '0 -4px 14px rgba(0,0,0,0.08)',
          zIndex: 60,
          backdropFilter: 'saturate(150%) blur(8px)',
        }}>
          {resvError && <p style={{ margin: '0 0 0.4rem', fontSize: '0.82rem', color: '#DC2626', fontWeight: 700, textAlign: 'center' }}>{resvError}</p>}
          <button
            type="button"
            onClick={submitReservations}
            disabled={resvSubmitting}
            style={{
              width: '100%',
              padding: '0.85rem 1rem', minHeight: 52,
              borderRadius: 14,
              border: 'none',
              background: resvSubmitting ? '#9CA3AF' : 'var(--color-primary)',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1.02rem',
              cursor: resvSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(32,205,141,0.28)',
              letterSpacing: '0.02em',
            }}
          >
            {resvSubmitting ? '저장 중...' : '✓ 예약하기'}
          </button>
        </div>
      )}

      {/* 시간 선택 모달 */}
      {timePickerOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setTimePickerOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 90, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem' }}
        >
          <div role="dialog" style={{
            width: '100%', maxWidth: 560, maxHeight: isMobile ? '88vh' : '90vh',
            background: '#fff',
            borderRadius: isMobile ? '18px 18px 0 0' : 16,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)' }}>⏰ 예약시간 선택</h3>
              <button type="button" onClick={() => setTimePickerOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40 }}>✕</button>
            </div>
            <div style={{ padding: '1rem', overflowY: 'auto', display: 'grid', gap: '0.9rem' }}>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.84rem', fontWeight: 800, color: '#3F6212' }}>날짜</label>
                <DateTimePicker
                  dateOnly
                  value={`${pickerDate}T00:00`}
                  onChange={(v) => setPickerDate(v.slice(0, 10))}
                  placeholder="날짜"
                  buttonStyle={{
                    width: '100%', padding: '0.7rem 0.9rem', minHeight: MIN_H,
                    background: '#fff',
                    border: '1.5px solid var(--color-primary)',
                    color: 'var(--color-ink)',
                    fontWeight: 800, fontSize: '0.95rem', textAlign: 'center',
                  }}
                />
                <span style={{
                  alignSelf: 'center',
                  padding: '0.25rem 0.7rem',
                  borderRadius: 999,
                  background: pickerDateDow === 0 ? '#FEE2E2' : pickerDateDow === 6 ? '#DBEAFE' : '#F3F4F6',
                  color: pickerDateDow === 0 ? '#DC2626' : pickerDateDow === 6 ? '#2563EB' : '#374151',
                  fontSize: '0.82rem', fontWeight: 800,
                }}>{dateDowLabel}요일</span>
              </div>

              {/* 타임라인 히트맵 — 이 날짜의 시간대별 혼잡도 (선택 전 충돌 시각 확인) */}
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.84rem', fontWeight: 800, color: '#3F6212', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.3rem' }}>
                  <span>그날의 혼잡도</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-ink-2)' }}>민트=선택 / 회색=사용중 / 빨강=교회일정</span>
                </label>
                <div style={{ display: 'flex', gap: '1px', height: 32, borderRadius: 6, overflow: 'hidden', background: '#F3F4F6' }}>
                  {timelineCells.map((c) => {
                    const heavy = Math.max(1, Math.floor(venues.length * 0.6));
                    const medium = Math.max(1, Math.floor(venues.length * 0.3));
                    const bg = c.isSelected
                      ? '#20CD8D'
                      : c.isEvent
                        ? '#FCA5A5'
                        : c.busyCount === 0
                          ? '#F7FEE7'
                          : c.busyCount >= heavy
                            ? '#6B7280'
                            : c.busyCount >= medium
                              ? '#9CA3AF'
                              : '#D1D5DB';
                    return (
                      <div
                        key={c.min}
                        title={`${String(Math.floor(c.min / 60)).padStart(2, '0')}:${String(c.min % 60).padStart(2, '0')} — ${c.isEvent ? '교회일정 포함' : c.busyCount === 0 ? '예약 0건' : `${c.busyCount}곳 사용중`}`}
                        style={{ flex: 1, background: bg, minWidth: 3 }}
                      />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--color-ink-2)', fontFamily: 'monospace' }}>
                  <span>{availableStart}</span>
                  <span>{availableEnd}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 800, color: '#3F6212' }}>시작시각</label>
                  <select
                    value={pickerStartHour * 60 + pickerStartMin}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPickerStartHour(Math.floor(v / 60));
                      setPickerStartMin(v % 60);
                    }}
                    style={{ width: '100%', padding: '0.65rem 0.6rem', minHeight: MIN_H, borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.95rem', fontWeight: 700, background: '#fff' }}
                  >
                    {(() => {
                      const startM = toMinLocal(availableStart);
                      const endM = toMinLocal(availableEnd);
                      const times: number[] = [];
                      for (let mm = startM; mm + slotMin <= endM; mm += slotMin) times.push(mm);
                      return times.map((mm) => (
                        <option key={mm} value={mm}>
                          {String(Math.floor(mm / 60)).padStart(2, '0')}:{String(mm % 60).padStart(2, '0')}
                        </option>
                      ));
                    })()}
                  </select>
                </div>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 800, color: '#3F6212' }}>지속시간</label>
                  <select
                    value={pickerDurationHours}
                    onChange={(e) => setPickerDurationHours(Number(e.target.value))}
                    style={{ width: '100%', padding: '0.65rem 0.6rem', minHeight: MIN_H, borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.95rem', fontWeight: 700, background: '#fff' }}
                  >
                    {(() => {
                      const endM = toMinLocal(availableEnd);
                      const currentStart = pickerStartHour * 60 + pickerStartMin;
                      const remain = (endM - currentStart) / 60;
                      return DURATION_OPTIONS.filter((h) => h <= remain).map((h) => {
                        const totalMin = Math.round(h * 60);
                        const hh = Math.floor(totalMin / 60);
                        const mm = totalMin % 60;
                        const label = hh === 0 ? `${mm}분` : mm === 0 ? `${hh}시간` : `${hh}시간${mm}분`;
                        return <option key={h} value={h}>{label}</option>;
                      });
                    })()}
                  </select>
                </div>
              </div>

              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--color-ink-2)', lineHeight: 1.6, listStyleType: 'disc' }}>
                <li><span style={{ color: '#3F6212', fontWeight: 800 }}>예약단위</span> : <strong>{slotMin}분</strong></li>
                <li>
                  <span style={{ color: '#3F6212', fontWeight: 800 }}>인당 한도</span> : {reservationLimitMode === 'perUser'
                    ? <><strong>최대 {reservationLimitPerUser}건</strong> (현재일 이후 예약)</>
                    : <strong>제한 없음</strong>}
                </li>
              </ul>
            </div>
            <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--color-surface-border)' }}>
              <button
                type="button"
                onClick={() => setTimePickerOpen(false)}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem', minHeight: 48,
                  borderRadius: 12, border: 'none',
                  background: 'var(--color-primary)', color: '#fff',
                  fontWeight: 800, fontSize: '0.98rem',
                  cursor: 'pointer',
                }}
              >적용</button>
            </div>
          </div>
        </div>
      )}

      {/* 장소 선택 모달 */}
      {venuePickerOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setVenuePickerOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 90, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem' }}
        >
          <div role="dialog" style={{
            width: '100%', maxWidth: 560, maxHeight: isMobile ? '88vh' : '90vh',
            background: '#fff',
            borderRadius: isMobile ? '18px 18px 0 0' : 16,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)' }}>📍 예약장소 선택</h3>
              <button type="button" onClick={() => setVenuePickerOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40 }}>✕</button>
            </div>
            <div style={{ padding: '0.9rem 1rem', overflowY: 'auto', display: 'grid', gap: '0.7rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>{timeSummary}</span>
                <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                  <button type="button" onClick={selectAll} style={{ padding: '0.4rem 0.7rem', minHeight: 36, borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>전체 선택</button>
                  <button type="button" onClick={clearAll} style={{ padding: '0.4rem 0.7rem', minHeight: 36, borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>전체 해제</button>
                </div>
              </div>

              {venuesByFloor.map(([floor, list]) => {
                const floorIds = list.map((v) => v.id);
                const selectableFloorIds = floorIds.filter((id) => !conflictedPickerVenueIds.has(id));
                const floorAllOn = selectableFloorIds.length > 0 && selectableFloorIds.every((id) => pickerSelected.has(id));
                const floorSomeOn = selectableFloorIds.some((id) => pickerSelected.has(id));
                const floorAllConflict = selectableFloorIds.length === 0;
                return (
                  <div key={floor} style={{ padding: '0.55rem 0.65rem', border: '1px solid var(--color-surface-border)', borderRadius: 10, background: '#FAFAF7', display: 'grid', gap: '0.45rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', fontWeight: 800, color: floorAllConflict ? '#9CA3AF' : '#3F6212', cursor: floorAllConflict ? 'not-allowed' : 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={floorAllOn}
                        disabled={floorAllConflict}
                        ref={(el) => { if (el) el.indeterminate = !floorAllOn && floorSomeOn; }}
                        onChange={() => toggleFloor(floor)}
                        style={{ width: 18, height: 18, accentColor: '#65A30D' }}
                      />
                      {floor}
                    </label>
                    {(() => {
                      const available = list.filter((v) => !conflictedPickerVenueIds.has(v.id));
                      const occupied = list.filter((v) => conflictedPickerVenueIds.has(v.id));
                      return (
                        <>
                          {available.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                              {available.map((v) => {
                                const on = pickerSelected.has(v.id);
                                return (
                                  <label
                                    key={v.id}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                      padding: '0.5rem 0.7rem', minHeight: 40,
                                      borderRadius: 10,
                                      background: on ? '#ECFCCB' : '#fff',
                                      border: on ? '1.5px solid #65A30D' : '1px solid var(--color-surface-border)',
                                      cursor: 'pointer',
                                      fontSize: '0.86rem', whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <input type="checkbox" checked={on} onChange={() => togglePickerVenue(v.id)} style={{ width: 16, height: 16, accentColor: '#65A30D' }} />
                                    <span style={{ color: 'var(--color-ink)', fontWeight: on ? 800 : 600 }}>{v.name}</span>
                                    <span style={{ color: 'var(--color-ink-2)', fontFamily: 'monospace', fontSize: '0.72rem' }}>({v.code})</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          {occupied.length > 0 && (
                            <details style={{ marginTop: available.length > 0 ? '0.3rem' : 0 }}>
                              <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: '#9CA3AF', fontWeight: 700, padding: '0.3rem 0.2rem', listStyle: 'revert' }}>
                                이 시간 사용중 ({occupied.length})
                              </summary>
                              <div style={{ display: 'grid', gap: '0.3rem', marginTop: '0.4rem' }}>
                                {occupied.map((v) => {
                                  const reason = conflictReasonByVenue.get(v.id) || '사용중';
                                  return (
                                    <div
                                      key={v.id}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                                        padding: '0.4rem 0.65rem',
                                        borderRadius: 8,
                                        background: '#F3F4F6',
                                        border: '1px dashed #9CA3AF',
                                        fontSize: '0.8rem',
                                        opacity: 0.7,
                                      }}
                                    >
                                      <span style={{ color: '#6B7280', fontWeight: 700, textDecoration: 'line-through' }}>{v.name}</span>
                                      <span style={{ color: '#9CA3AF', fontFamily: 'monospace', fontSize: '0.68rem' }}>({v.code})</span>
                                      <span style={{ marginLeft: 'auto', color: '#6B7280', fontSize: '0.74rem', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                        {reason}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--color-surface-border)' }}>
              <button
                type="button"
                onClick={() => setVenuePickerOpen(false)}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem', minHeight: 48,
                  borderRadius: 12, border: 'none',
                  background: 'var(--color-primary)', color: '#fff',
                  fontWeight: 800, fontSize: '0.98rem',
                  cursor: 'pointer',
                }}
              >적용 ({pickerSelected.size}곳 선택)</button>
            </div>
          </div>
        </div>
      )}

      {/* 필수정보 요청 */}
      {showRequiredModal && effectiveProfileId && (
        <RequiredInfoModal
          profileId={effectiveProfileId}
          missingFields={missingFields}
          message="실명과 연락처를 입력하시면 예약을 진행하실 수 있습니다."
          onComplete={() => { setShowRequiredModal(false); setMissingFields([]); }}
          onCancel={() => setShowRequiredModal(false)}
        />
      )}

      {/* perUser 한도 초과 — 기존 예약 수정/삭제 */}
      {showLimitModal && effectiveProfileId && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowLimitModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 95, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem' }}
        >
          <div role="dialog" style={{
            width: '100%', maxWidth: 560, maxHeight: isMobile ? '88vh' : '90vh',
            background: '#fff',
            borderRadius: isMobile ? '18px 18px 0 0' : 16,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)' }}>예약 한도 초과</h3>
              <button type="button" onClick={() => setShowLimitModal(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40 }}>✕</button>
            </div>
            <div style={{ padding: '0.9rem 1rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
              <div style={{ padding: '0.7rem 0.85rem', borderRadius: 10, background: '#FEF3C7', border: '1px solid #FBBF24', fontSize: '0.88rem', color: '#78350F', lineHeight: 1.5 }}>
                현재 예약 <strong>{myFutureReservations?.length ?? 0}건</strong> / 인당 최대 <strong>{reservationLimitPerUser}건</strong>.<br />
                새 예약을 진행하려면 기존 예약 중 하나를 삭제하세요. 제목은 수정 가능합니다.
              </div>
              {(myFutureReservations || []).length === 0 ? (
                <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>표시할 예약이 없습니다.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
                  {(myFutureReservations || []).map((r) => {
                    const s = new Date(r.startAt);
                    const e = new Date(r.endAt);
                    const pad = (n: number) => String(n).padStart(2, '0');
                    const dateStr = `${pad(s.getMonth() + 1)}/${pad(s.getDate())} (${WEEK_LABELS[s.getDay()]})`;
                    const timeStr = `${pad(s.getHours())}:${pad(s.getMinutes())}~${pad(e.getHours())}:${pad(e.getMinutes())}`;
                    const editing = editingId === r.id;
                    return (
                      <li key={r.id} style={{ padding: '0.75rem 0.9rem', borderRadius: 12, background: '#ECFCCB', border: '1px solid #D9F09E', display: 'grid', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-ink)' }}>{dateStr}</span>
                          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)' }}>{timeStr}</span>
                        </div>
                        {editing ? (
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input type="text" value={editTitle} onChange={(ev) => setEditTitle(ev.target.value)} autoFocus style={{ flex: '1 1 180px', padding: '0.55rem 0.75rem', minHeight: MIN_H, borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.92rem' }} />
                            <button type="button" disabled={limitActionBusy} onClick={() => saveEditMine(r)} style={{ padding: '0.55rem 0.95rem', minHeight: MIN_H, borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: limitActionBusy ? 'not-allowed' : 'pointer' }}>저장</button>
                            <button type="button" onClick={cancelEditMine} style={{ padding: '0.55rem 0.9rem', minHeight: MIN_H, borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>취소</button>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.92rem', color: 'var(--color-ink)', fontWeight: 700 }}>{r.title}</span>
                              {r.location && <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>· 📍 {r.location}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button type="button" onClick={() => copyFromReservation(r)} title="이 예약과 같은 모임구분·장소로 새 예약 만들기" style={{ padding: '0.45rem 0.8rem', minHeight: 40, borderRadius: 8, border: '1px solid #20CD8D', background: '#ECFDF5', color: '#065F46', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>🔄 같은 모임으로</button>
                              <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.35rem' }}>
                                <button type="button" onClick={() => startEditMine(r)} style={{ padding: '0.45rem 0.8rem', minHeight: 40, borderRadius: 8, border: '1px solid #65A30D', background: '#fff', color: '#3F6212', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>수정</button>
                                <button type="button" disabled={limitActionBusy} onClick={() => handleDeleteMine(r)} style={{ padding: '0.45rem 0.8rem', minHeight: 40, borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontWeight: 800, fontSize: '0.8rem', cursor: limitActionBusy ? 'not-allowed' : 'pointer' }}>삭제</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 예약자 정보 수정 */}
      {profileModalOpen && effectiveProfileId && (
        <ProfileModal
          profileId={effectiveProfileId}
          nickname={nickname}
          email={email}
          initialRealName={currentDisplayName || displayName}
          initialContact={currentContact || contact}
          onClose={() => setProfileModalOpen(false)}
          onSaved={(next) => { setCurrentDisplayName(next.realName); setCurrentContact(next.contact); }}
        />
      )}
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const queryProfileId = typeof ctx.query.profileId === 'string' ? ctx.query.profileId : null;
  const [venuesArr, blocksArr, groupsArr, settingsObj, eventsArr, profilesArr, adminsObj] = await Promise.all([
    getVenues().catch(() => [] as any[]),
    getVenueBlocks().catch(() => [] as any[]),
    getVenueBlockGroups().catch(() => [] as any[]),
    getSettings().catch(() => ({} as any)),
    getEvents().catch(() => [] as any[]),
    getProfiles().catch(() => [] as any[]),
    getSystemAdmins().catch(() => ({ profileIds: [] as string[] })),
  ]);
  const venues = venuesArr as Venue[];
  const adhocBlocks = blocksArr as Block[];
  const groups = groupsArr as BlockGroup[];
  const allEvents = eventsArr as RawEventRow[];
  const profileMap = new Map<string, { realName?: string; contact?: string }>();
  for (const p of (profilesArr as any[])) {
    if (p?.profileId) profileMap.set(p.profileId, { realName: p.realName, contact: p.contact });
  }
  const adminIds: string[] = Array.isArray((adminsObj as any)?.profileIds) ? (adminsObj as any).profileIds : [];
  const adminEmails: string[] = Array.isArray((adminsObj as any)?.emails) ? ((adminsObj as any).emails as string[]).map((e) => String(e).trim().toLowerCase()) : [];
  const queryEmail = typeof ctx.query.email === 'string' ? ctx.query.email.trim().toLowerCase() : null;
  const isAdmin = (queryProfileId && adminIds.includes(queryProfileId)) || (!!queryEmail && adminEmails.includes(queryEmail));

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59);
  const occurrences = allEvents.flatMap((e) => expandOccurrences(e, { from, to }));

  const eventBlocks: Block[] = [];
  for (const occ of occurrences) {
    let vid = occ.venueId;
    if (!vid && occ.location) {
      const v = venues.find((x) => occ.location!.includes(`(${x.code})`) || occ.location === `${x.floor} ${x.name}(${x.code})`);
      if (v) vid = v.id;
    }
    if (!vid) continue;
    const occType = (occ as any).type || 'event';
    const kind: 'event' | 'reservation' = occType === 'reservation' ? 'reservation' : 'event';
    const isOwner = !!queryProfileId && occ.createdBy === queryProfileId;
    const canSeeReserver = kind === 'reservation' && (isAdmin || isOwner);
    const reserver = canSeeReserver ? profileMap.get(occ.createdBy) : undefined;
    const reserverName = canSeeReserver ? (reserver?.realName || occ.createdByName || '') : '';
    const reserverContact = canSeeReserver ? (reserver?.contact || '') : '';
    const block: Block = {
      id: `occ-${occ.occurrenceId}`,
      venueId: vid,
      startAt: occ.startAt,
      endAt: occ.endAt,
      reason: occ.title,
      kind,
    };
    if (reserverName) block.reserverName = reserverName;
    if (reserverContact) block.reserverContact = reserverContact;
    eventBlocks.push(block);
  }
  const adhocTyped: Block[] = adhocBlocks.map((b) => ({ ...b, kind: b.kind || 'block' }));
  const blocks: Block[] = [...adhocTyped, ...eventBlocks];
  const settings = (settingsObj || {}) as { venueSlotMin?: number; venueAvailableStart?: string; venueAvailableEnd?: string; reservationLimitMode?: string; reservationLimitPerUser?: number };
  const slotMin = settings.venueSlotMin === 60 ? 60 : 30;
  const availableStart = typeof settings.venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableStart) ? settings.venueAvailableStart : '06:00';
  const availableEnd = typeof settings.venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableEnd) ? settings.venueAvailableEnd : '22:00';
  const reservationLimitMode: 'unlimited' | 'perUser' = settings.reservationLimitMode === 'perUser' ? 'perUser' : 'unlimited';
  const reservationLimitPerUser = Math.max(1, Math.min(10, Number(settings.reservationLimitPerUser) || 3));

  const profileId = queryProfileId;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;

  let displayName: string | null = nickname;
  let contact: string | null = null;
  if (profileId) {
    try {
      const users = await getUsers().catch(() => [] as any[]);
      const p = (profilesArr as Array<any>).find((x) => x.profileId === profileId);
      const u = (users as Array<any>).find((x) => x.providerProfileId === profileId);
      displayName = p?.realName || u?.realName || u?.nickname || nickname || null;
      contact = (p?.contact || u?.contact || null) || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });

  return { props: { venues, blocks, groups, slotMin, availableStart, availableEnd, reservationLimitMode, reservationLimitPerUser, profileId, displayName, contact, nickname, email, systemAdminHref } };
};

export default ReservationPage;
