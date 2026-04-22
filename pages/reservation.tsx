import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import SubHeader from '../components/SubHeader';
import VenueGrid, { Venue, Block, BlockGroup, dateKey, toHHMM, toMin as toMinLocal, computeBlockedSlotsForDate } from '../components/VenueGrid';
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

const ReservationPage = ({ venues, blocks, groups, slotMin, availableStart, availableEnd, reservationLimitMode, reservationLimitPerUser, profileId, displayName, contact, nickname, email, systemAdminHref }: Props) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  useRequireLogin(profileId);
  const [selectedDate, setSelectedDate] = useState<string>(dateKey(new Date()));
  const [effectiveProfileId, setEffectiveProfileId] = useState<string | null>(profileId);
  const [missingFields, setMissingFields] = useState<Array<'realName' | 'contact'>>([]);
  const [showRequiredModal, setShowRequiredModal] = useState(false);

  // 인라인 선택 상태: venueId → Set<startMin>
  const [selectedSlots, setSelectedSlots] = useState<Map<string, Set<number>>>(new Map());
  // 대체 장소(picker에서 함께 선택됐지만 active가 아닌 후보): 클릭 시 active와 교체됨
  const [alternateSlots, setAlternateSlots] = useState<Map<string, Set<number>>>(new Map());
  // 예약자 정보 수정 모달
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(displayName);
  const [currentContact, setCurrentContact] = useState<string | null>(contact);
  // 프로필이 다른 모달(SubHeader·대시보드 등)에서 수정되면 전역 이벤트로 동기화
  useEffect(() => {
    const onProfileUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ realName?: string; contact?: string }>).detail;
      if (detail?.realName) setCurrentDisplayName(detail.realName);
      if (detail?.contact) setCurrentContact(detail.contact);
    };
    window.addEventListener('kcis-profile-updated', onProfileUpdated);
    return () => window.removeEventListener('kcis-profile-updated', onProfileUpdated);
  }, []);
  // 예약자 확인 체크박스 3종 — 모두 체크되어야 완료 가능
  const [confirmMember, setConfirmMember] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const allConfirmed = confirmMember && confirmCancel;
  const [confirmShake, setConfirmShake] = useState(false);
  const triggerConfirmShake = () => {
    setConfirmShake(true);
    setTimeout(() => setConfirmShake(false), 650);
  };
  const [profileShake, setProfileShake] = useState(false);
  const triggerProfileShake = () => {
    setProfileShake(true);
    setTimeout(() => setProfileShake(false), 650);
  };
  const [resvTitle, setResvTitle] = useState('');
  const [resvSubmitting, setResvSubmitting] = useState(false);
  const [resvError, setResvError] = useState<string | null>(null);

  // 날짜 바뀌면 선택 초기화 (단, picker 확인으로 날짜가 바뀐 경우엔 pending{Slots,Alternate}Ref에 담긴 값으로 대체)
  const pendingSlotsRef = useRef<Map<string, Set<number>> | null>(null);
  const pendingAlternateRef = useRef<Map<string, Set<number>> | null>(null);
  const reservationBarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (pendingSlotsRef.current) {
      setSelectedSlots(pendingSlotsRef.current);
      pendingSlotsRef.current = null;
    } else {
      setSelectedSlots(new Map());
    }
    if (pendingAlternateRef.current) {
      setAlternateSlots(pendingAlternateRef.current);
      pendingAlternateRef.current = null;
    } else {
      setAlternateSlots(new Map());
    }
    setResvError(null);
  }, [selectedDate]);

  const totalSelected = Array.from(selectedSlots.values()).reduce((acc, s) => acc + s.size, 0);

  const isContiguousSet = (set: Set<number>, step: number): boolean => {
    if (set.size <= 1) return true;
    const s = Array.from(set).sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) {
      if (s[i] !== s[i - 1] + step) return false;
    }
    return true;
  };

  // 특정 장소의 특정 슬롯이 (blocks + groups 기준) 예약 불가인지 확인
  const isSlotBlockedFor = (venueId: string, mi: number, dateStr: string, groupSlotMap: Map<string, Set<number>>): boolean => {
    const [yy, mm, dd] = dateStr.split('-').map(Number);
    const ss = new Date(yy, mm - 1, dd, Math.floor(mi / 60), mi % 60);
    const se = new Date(ss.getTime() + slotMin * 60 * 1000);
    for (const b of blocks) {
      if (b.venueId !== venueId) continue;
      const bs = new Date(b.startAt).getTime();
      const be = b.endAt ? new Date(b.endAt).getTime() : Number.POSITIVE_INFINITY;
      if (bs < se.getTime() && be > ss.getTime()) return true;
    }
    const gset = groupSlotMap.get(venueId);
    if (gset && gset.has(mi)) return true;
    return false;
  };

  const handleSlotClick = (v: Venue, startMin: number, blocked: boolean) => {
    if (blocked) return;
    if (!effectiveProfileId) { window.location.href = '/auth/login'; return; }
    if (missingFields.length > 0) { setShowRequiredModal(true); return; }

    const activeVid = selectedSlots.size > 0 ? Array.from(selectedSlots.keys())[0] : null;
    const groupSlotMap = computeBlockedSlotsForDate(groups, selectedDate);

    // Case A: 현재 active와 같은 장소
    if (activeVid === v.id) {
      const currentSet = selectedSlots.get(v.id) || new Set<number>();

      // 1) 이미 선택된 셀 클릭 → 그 셀까지만 남기고 잘라내기
      // 예: 9:00-11:00 선택 상태에서 10:00 클릭 → 9:00-10:30 (클릭한 셀이 새 끝)
      if (currentSet.has(startMin)) {
        const sortedCur = Array.from(currentSet).sort((a, b) => a - b);
        const firstSlot = sortedCur[0];
        const newSet = new Set<number>();
        for (let mi = firstSlot; mi <= startMin; mi += slotMin) newSet.add(mi);
        setResvError(null);
        setSelectedSlots((prev) => {
          const next = new Map(prev);
          if (newSet.size === 0) next.delete(v.id);
          else next.set(v.id, newSet);
          return next;
        });
        return;
      }

      // 2) 비어있던 셀 클릭
      const sorted = Array.from(currentSet).sort((a, b) => a - b);
      if (sorted.length === 0) {
        // 첫 슬롯 추가
        setResvError(null);
        setSelectedSlots((prev) => {
          const next = new Map(prev);
          next.set(v.id, new Set<number>([startMin]));
          return next;
        });
        return;
      }
      const firstSlot = sorted[0];
      const lastSlot = sorted[sorted.length - 1];
      const newSet = new Set(currentSet);
      // 범위 확장: 클릭 위치가 뒤쪽이면 lastSlot+slotMin ~ clicked, 앞쪽이면 clicked ~ firstSlot-slotMin
      // 중간에 블럭이 있으면 그 직전까지만 채움
      if (startMin > lastSlot) {
        let added = false;
        for (let mi = lastSlot + slotMin; mi <= startMin; mi += slotMin) {
          if (isSlotBlockedFor(v.id, mi, selectedDate, groupSlotMap)) break;
          newSet.add(mi);
          added = true;
        }
        if (!added) {
          setResvError('이어지는 예약 가능 슬롯이 없어 이 위치까지 확장할 수 없습니다.');
          return;
        }
      } else if (startMin < firstSlot) {
        // 뒤에서부터 채워야 중간 블럭 전까지의 연속 구간만 추가됨
        let added = false;
        for (let mi = firstSlot - slotMin; mi >= startMin; mi -= slotMin) {
          if (isSlotBlockedFor(v.id, mi, selectedDate, groupSlotMap)) break;
          newSet.add(mi);
          added = true;
        }
        if (!added) {
          setResvError('이어지는 예약 가능 슬롯이 없어 이 위치까지 확장할 수 없습니다.');
          return;
        }
      } else {
        // 이론상 존재하지 않는 케이스 (현 선택이 연속이므로 중간이 비어있을 수 없음)
        return;
      }
      setResvError(null);
      setSelectedSlots((prev) => {
        const next = new Map(prev);
        next.set(v.id, newSet);
        return next;
      });
      return;
    }

    // Case B: 다른 장소 클릭 → swap (단 연속성 유지)
    const altSet = alternateSlots.get(v.id);
    const newActiveSlots = new Set<number>(altSet || []);
    if (!altSet || !altSet.has(startMin)) newActiveSlots.add(startMin);
    if (!isContiguousSet(newActiveSlots, slotMin)) {
      setResvError('연속된 시간만 예약할 수 있습니다. 이 장소의 기존 범위와 이어지지 않는 슬롯입니다.');
      return;
    }

    const nextAlternate = new Map(alternateSlots);
    nextAlternate.delete(v.id);
    if (activeVid) {
      const prevActiveSlots = selectedSlots.get(activeVid);
      if (prevActiveSlots && prevActiveSlots.size > 0) {
        nextAlternate.set(activeVid, new Set(prevActiveSlots));
      }
    }
    const nextSelected = new Map<string, Set<number>>();
    if (newActiveSlots.size > 0) nextSelected.set(v.id, newActiveSlots);
    setResvError(null);
    setSelectedSlots(nextSelected);
    setAlternateSlots(nextAlternate);
  };

  // 선택된 슬롯을 venue별 연속 범위로 묶어 예약
  const submitReservations = async () => {
    if (!effectiveProfileId) return;
    if (totalSelected === 0) { setResvError('예약할 시간을 먼저 선택하세요.'); return; }
    if (!resvTitle.trim()) { setResvError('제목을 입력하세요.'); return; }

    // 선택된 슬롯이 기존 블럭/예약과 겹치는지 확인 (충돌 셀은 "예약불가"로 표시됨)
    const activeVid = Array.from(selectedSlots.keys())[0];
    const activeVenue = venues.find((v) => v.id === activeVid);
    if (!activeVenue) { setResvError('장소가 선택되지 않았습니다.'); return; }
    const activeSet = selectedSlots.get(activeVid) || new Set<number>();
    const [yy, mm, dd] = selectedDate.split('-').map(Number);
    for (const startMin of activeSet) {
      const ss = new Date(yy, mm - 1, dd, Math.floor(startMin / 60), startMin % 60);
      const se = new Date(ss.getTime() + slotMin * 60 * 1000);
      for (const b of blocks) {
        if (b.venueId !== activeVid) continue;
        const bs = new Date(b.startAt).getTime();
        const be = b.endAt ? new Date(b.endAt).getTime() : Number.POSITIVE_INFINITY;
        if (bs < se.getTime() && be > ss.getTime()) {
          setResvError('예약 불가 시간이 포함되어 있습니다. 주황색(예약불가) 셀을 해제한 뒤 다시 시도하세요.');
          return;
        }
      }
    }

    // 연속된 슬롯만 허용 (띄엄띄엄 예약 금지)
    const sortedSlots = Array.from(activeSet).sort((a, b) => a - b);
    for (let i = 1; i < sortedSlots.length; i++) {
      if (sortedSlots[i] !== sortedSlots[i - 1] + slotMin) {
        setResvError('연속된 시간만 예약할 수 있습니다. 중간에 비어있는 슬롯 없이 이어진 시간대만 선택하세요.');
        return;
      }
    }

    setResvSubmitting(true);
    setResvError(null);
    try {
      const [y, mo, d] = selectedDate.split('-').map(Number);
      const tasks: Array<{ venue: Venue; startMin: number; endMin: number }> = [];
      for (const [venueId, mins] of selectedSlots.entries()) {
        const v = venues.find((x) => x.id === venueId);
        if (!v) continue;
        const sorted = Array.from(mins).sort((a, b) => a - b);
        let runStart = sorted[0];
        let runPrev = sorted[0];
        for (let i = 1; i <= sorted.length; i++) {
          if (i === sorted.length || sorted[i] !== runPrev + slotMin) {
            tasks.push({ venue: v, startMin: runStart, endMin: runPrev + slotMin });
            if (i < sorted.length) { runStart = sorted[i]; runPrev = sorted[i]; }
          } else {
            runPrev = sorted[i];
          }
        }
      }
      for (const t of tasks) {
        const startAt = new Date(y, mo - 1, d, Math.floor(t.startMin / 60), t.startMin % 60).toISOString();
        const endAt = new Date(y, mo - 1, d, Math.floor(t.endMin / 60), t.endMin % 60).toISOString();
        const description = resvTitle.trim();
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId: 'kcis',
            profileId: effectiveProfileId,
            title: resvTitle.trim(),
            description,
            startAt, endAt,
            venueId: t.venue.id,
            location: `${t.venue.floor} ${t.venue.name}(${t.venue.code})`,
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
      setSelectedSlots(new Map());
      setAlternateSlots(new Map());
      setResvTitle('');

      // 확인 메시지 — 예약된 항목 요약
      const summary = tasks.map((t) => {
        const sh = String(Math.floor(t.startMin / 60)).padStart(2, '0');
        const sm = String(t.startMin % 60).padStart(2, '0');
        const eh = String(Math.floor(t.endMin / 60)).padStart(2, '0');
        const em = String(t.endMin % 60).padStart(2, '0');
        return `• ${selectedDate} ${sh}:${sm}~${eh}:${em} · ${t.venue.floor} ${t.venue.name}`;
      }).join('\n');
      alert(`예약이 완료되었습니다.\n\n${summary}\n\n예약현황 페이지로 이동합니다.`);

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

  // 페이지 진입 시 날짜+장소 선택 모달 — 조회용이므로 바로 열어 선택 유도
  const [pickerOpen, setPickerOpen] = useState(true);
  const [pickerDate, setPickerDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return dateKey(d);
  });
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(() => new Set());
  const [confirmedVenueIds, setConfirmedVenueIds] = useState<Set<string>>(() => new Set(venues.map((v) => v.id)));

  const venuesByFloor = (() => {
    const groups = new Map<string, Venue[]>();
    for (const v of venues) {
      if (!groups.has(v.floor)) groups.set(v.floor, []);
      groups.get(v.floor)!.push(v);
    }
    const entries = Array.from(groups.entries());
    entries.sort(([a], [b]) => {
      const fa = Number((a.match(/(\d+)/) || [])[1] || 0);
      const fb = Number((b.match(/(\d+)/) || [])[1] || 0);
      return fa - fb;
    });
    for (const [, list] of entries) list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return entries;
  })();

  const togglePickerVenue = (id: string) => {
    if (conflictedPickerVenueIds.has(id)) return;  // 충돌 장소는 선택 불가
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleFloor = (floor: string) => setPickerSelected((prev) => {
    const next = new Set(prev);
    // 충돌 장소 제외한 같은 층 id들만 대상
    const floorIds = venues.filter((v) => v.floor === floor && !conflictedPickerVenueIds.has(v.id)).map((v) => v.id);
    if (floorIds.length === 0) return prev;
    const allOn = floorIds.every((id) => next.has(id));
    if (allOn) floorIds.forEach((id) => next.delete(id));
    else floorIds.forEach((id) => next.add(id));
    return next;
  });
  const selectAll = () => setPickerSelected(new Set(venues.filter((v) => !conflictedPickerVenueIds.has(v.id)).map((v) => v.id)));
  const clearAll = () => setPickerSelected(new Set());

  // (시간·지속시간 선택 제거 — 사용자는 날짜·장소만 고르고 시간은 VenueGrid에서 셀 클릭으로 선택)

  // 현재 날짜에 종일 블럭/이벤트가 있어 전혀 사용 불가한 장소는 없으므로 conflict 판정 생략
  const conflictedPickerVenueIds = useMemo(() => new Set<string>(), []);

  const confirmPicker = () => {
    if (pickerSelected.size === 0) { alert('한 개 이상의 장소를 선택하세요.'); return; }
    const sameDate = pickerDate === selectedDate;
    if (!sameDate) {
      pendingSlotsRef.current = new Map();
      pendingAlternateRef.current = new Map();
      setSelectedDate(pickerDate);
    } else {
      setSelectedSlots(new Map());
      setAlternateSlots(new Map());
      setResvError(null);
    }
    setConfirmedVenueIds(new Set(pickerSelected));
    setPickerOpen(false);
    requestAnimationFrame(() => {
      setTimeout(() => reservationBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    });
  };

  const visibleVenues = venues.filter((v) => confirmedVenueIds.has(v.id));

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

  return (
    <>
      <Head>
        <title>KCIS | 예약현황보기</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader
        profileId={profileId}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref}
      />

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: '1rem' }}>
        <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>📖 예약현황보기</h2>
              {(() => {
                const [y, mo, d] = selectedDate.split('-').map(Number);
                if (!y || !mo || !d) return null;
                const dowI = new Date(y, mo - 1, d).getDay();
                const labels = ['일', '월', '화', '수', '목', '금', '토'];
                const todayK = dateKey(new Date());
                const isToday = selectedDate === todayK;
                const dowBg = dowI === 0 ? '#FEE2E2' : dowI === 6 ? '#DBEAFE' : '#F3F4F6';
                const dowFg = dowI === 0 ? '#DC2626' : dowI === 6 ? '#2563EB' : '#374151';
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: isMobile ? '0.92rem' : '0.98rem', fontWeight: 800, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>{selectedDate}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 999, background: dowBg, color: dowFg, fontSize: '0.76rem', fontWeight: 800 }}>{labels[dowI]}</span>
                    {isToday && (
                      <span style={{ padding: '0.15rem 0.55rem', borderRadius: 999, background: '#ECFDF5', border: '1px solid #20CD8D', color: 'var(--color-primary-deep)', fontSize: '0.72rem', fontWeight: 800 }}>오늘</span>
                    )}
                  </span>
                );
              })()}
            </div>
            <button
              type="button"
              onClick={() => {
                setPickerDate(selectedDate);
                setPickerSelected(new Set(confirmedVenueIds));
                setPickerOpen(true);
              }}
              style={{ padding: '0.5rem 0.95rem', minHeight: 40, borderRadius: 999, border: '1px solid #65A30D', background: '#fff', color: '#3F6212', fontSize: '0.86rem', fontWeight: 800, cursor: 'pointer' }}
            >날짜·장소 변경</button>
          </div>
          <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.78rem', color: 'var(--color-ink-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#F7FEE7', border: '1px solid #D9F09E' }} /> 예약 가능</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#DC2626' }} /> 교회일정</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#0F7A52', outline: '2px solid #FBBF24', outlineOffset: -1 }} /> ⭐ 내 예약</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#9CA3AF' }} /> 타인 예약</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#7C3AED' }} /> 교회 사용</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#E5E7EB' }} /> 예약 불가 시간</span>
          </div>
          <VenueGrid
            venues={visibleVenues}
            blocks={blocks}
            groups={groups}
            selectedDate={selectedDate}
            slotMin={slotMin}
            availableStart={availableStart}
            availableEnd={availableEnd}
          />

          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>
            💡 이 화면은 모든 장소의 예약 현황을 한눈에 보는 조회 전용입니다. 새 예약은 상단 <strong>‘장소예약’</strong> 메뉴에서 진행하세요.
          </p>
        </section>
      </main>

      {showRequiredModal && effectiveProfileId && (
        <RequiredInfoModal
          profileId={effectiveProfileId}
          missingFields={missingFields}
          message="실명과 연락처를 입력하시면 예약을 진행하실 수 있습니다."
          onComplete={() => { setShowRequiredModal(false); setMissingFields([]); }}
          onCancel={() => setShowRequiredModal(false)}
        />
      )}

      {pickerOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPickerOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div role="dialog" className="modal-card" style={{ width: '100%', maxWidth: 560, maxHeight: '90vh', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>예약시간/장소조회</h3>
              <button type="button" onClick={() => setPickerOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-ink-2)' }}>✕</button>
            </div>

            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'grid', gap: '1rem' }}>
              {/* === 섹션 1: 예약시간 선택 === */}
              <div style={{ display: 'grid', gap: '0.55rem', padding: '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '1rem' }}>⏰</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#3F6212' }}>예약날짜/시간 선택</span>
                </div>
                {/* 한 줄: 날짜 + 요일 + 시작시각 + 지속 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <DateTimePicker
                    dateOnly
                    value={`${pickerDate}T00:00`}
                    onChange={(v) => setPickerDate(v.slice(0, 10))}
                    placeholder="날짜"
                    style={{ flex: '0 1 160px' }}
                    buttonStyle={{
                      width: '100%',
                      background: '#fff',
                      border: '1.5px solid var(--color-primary)',
                      color: 'var(--color-ink)',
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      padding: '0.55rem 0.7rem',
                      textAlign: 'center',
                    }}
                  />
                  {(() => {
                    const [y, m, d] = pickerDate.split('-').map(Number);
                    if (!y || !m || !d) return null;
                    const dow = new Date(y, m - 1, d).getDay();
                    const labels = ['일', '월', '화', '수', '목', '금', '토'];
                    const bg = dow === 0 ? '#FEE2E2' : dow === 6 ? '#DBEAFE' : '#F3F4F6';
                    const color = dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : '#374151';
                    const border = dow === 0 ? '1px solid #FCA5A5' : dow === 6 ? '1px solid #93C5FD' : '1px solid var(--color-surface-border)';
                    return (
                      <span
                        aria-label={`${labels[dow]}요일`}
                        title={`${labels[dow]}요일`}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, background: bg, color, border, fontWeight: 800, fontSize: '0.82rem', flex: '0 0 auto' }}
                      >
                        {labels[dow]}
                      </span>
                    );
                  })()}
                </div>

                <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
                  ⏰ 시간은 완료 후 나오는 그리드에서 빈 셀을 <strong>클릭</strong>{!isMobile && ' 또는 드래그'}해서 선택하세요.
                </p>

                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.75rem', color: 'var(--color-ink-2)', lineHeight: 1.6, listStyleType: 'disc' }}>
                  <li>
                    <span style={{ color: '#3F6212', fontWeight: 800 }}>예약단위</span> : <strong style={{ color: 'var(--color-ink)', fontWeight: 800 }}>{slotMin}분</strong>
                  </li>
                  <li>
                    <span style={{ color: '#3F6212', fontWeight: 800 }}>인당 한도</span> : {reservationLimitMode === 'perUser'
                      ? <><strong style={{ color: 'var(--color-ink)', fontWeight: 800 }}>최대 {reservationLimitPerUser}건</strong> <span style={{ color: 'var(--color-ink-2)' }}>(현재일 이후 예약건)</span></>
                      : <strong style={{ color: 'var(--color-ink)', fontWeight: 800 }}>제한 없음</strong>}
                  </li>
                </ul>
              </div>

              {/* === 섹션 2: 장소 선택 — 연라임 === */}
              <div style={{ display: 'grid', gap: '0.55rem', padding: '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1rem' }}>📍</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#3F6212' }}>장소 선택</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>({pickerSelected.size}/{venues.length})</span>
                  </div>
                  <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                    <button type="button" onClick={selectAll} style={{ padding: '0.3rem 0.65rem', borderRadius: 6, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>전체 선택</button>
                    <button type="button" onClick={clearAll} style={{ padding: '0.3rem 0.65rem', borderRadius: 6, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>전체 해제</button>
                  </div>
                </div>

                {venuesByFloor.map(([floor, list]) => {
                  const floorIds = list.map((v) => v.id);
                  const selectableFloorIds = floorIds.filter((id) => !conflictedPickerVenueIds.has(id));
                  const floorAllOn = selectableFloorIds.length > 0 && selectableFloorIds.every((id) => pickerSelected.has(id));
                  const floorSomeOn = selectableFloorIds.some((id) => pickerSelected.has(id));
                  const floorAllConflict = selectableFloorIds.length === 0;
                  return (
                    <div key={floor} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.45rem 0.6rem', border: '1px solid var(--color-surface-border)', borderRadius: 10, background: '#FAFAF7', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.88rem', fontWeight: 800, color: floorAllConflict ? '#9CA3AF' : '#3F6212', cursor: floorAllConflict ? 'not-allowed' : 'pointer', flex: '0 0 auto', paddingTop: '0.25rem' }}>
                        <input
                          type="checkbox"
                          checked={floorAllOn}
                          disabled={floorAllConflict}
                          ref={(el) => { if (el) el.indeterminate = !floorAllOn && floorSomeOn; }}
                          onChange={() => toggleFloor(floor)}
                        />
                        {floor}
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                        {list.map((v) => {
                          const on = pickerSelected.has(v.id);
                          const conflict = conflictedPickerVenueIds.has(v.id);
                          const bg = conflict ? '#F3F4F6' : on ? '#F7FEE7' : '#fff';
                          const border = conflict ? '1px dashed #9CA3AF' : on ? '1px solid #65A30D' : '1px solid var(--color-surface-border)';
                          return (
                            <label key={v.id} title={conflict ? '이 시간에 기존 예약/블럭이 있어 선택 불가' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.55rem', borderRadius: 8, background: bg, border, cursor: conflict ? 'not-allowed' : 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap', opacity: conflict ? 0.5 : 1, textDecoration: conflict ? 'line-through' : 'none' }}>
                              <input type="checkbox" checked={on} disabled={conflict} onChange={() => togglePickerVenue(v.id)} />
                              <span style={{ color: 'var(--color-ink)', fontWeight: on ? 700 : 500 }}>{v.name}</span>
                              <span style={{ color: 'var(--color-ink-2)', fontFamily: 'monospace', fontSize: '0.72rem' }}>({v.code})</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--color-surface-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                style={{ padding: '0.55rem 1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, cursor: 'pointer' }}
              >취소</button>
              <button
                type="button"
                onClick={confirmPicker}
                style={{
                  padding: '0.55rem 1.1rem',
                  borderRadius: 'var(--radius-lg)',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                  opacity: 1,
                }}
              >완료</button>
            </div>
          </div>
        </div>
      )}

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
  // 예약자 profileId → {realName, contact} 조회 맵
  const profileMap = new Map<string, { realName?: string; contact?: string }>();
  for (const p of (profilesArr as any[])) {
    if (p?.profileId) profileMap.set(p.profileId, { realName: p.realName, contact: p.contact });
  }
  // 권한: 현재 뷰어가 시스템 관리자인가? (profileId 또는 email 매칭)
  const adminIds: string[] = Array.isArray((adminsObj as any)?.profileIds) ? (adminsObj as any).profileIds : [];
  const adminEmails: string[] = Array.isArray((adminsObj as any)?.emails) ? ((adminsObj as any).emails as string[]).map((e) => String(e).trim().toLowerCase()) : [];
  const queryEmail = typeof ctx.query.email === 'string' ? ctx.query.email.trim().toLowerCase() : null;
  const isAdmin = (queryProfileId && adminIds.includes(queryProfileId)) || (!!queryEmail && adminEmails.includes(queryEmail));

  // SSR에서는 ±2개월 범위만 펼쳐서 grid 블럭으로 변환 (성능 보호)
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
    // 예약자 개인정보 노출: 관리자이거나 본인 예약일 때만
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
    if (kind === 'reservation' && isOwner) block.mine = true;
    if (reserverName) block.reserverName = reserverName;
    if (reserverContact) block.reserverContact = reserverContact;
    eventBlocks.push(block);
  }
  // adhocBlocks는 관리자 차단(kind=block) 기본값 유지
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
