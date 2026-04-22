import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import SubHeader from '../../components/SubHeader';
import VenueGrid, { Venue, Block, BlockGroup, dateKey, computeBlockedSlotsForDate } from '../../components/VenueGrid';
import DateTimePicker from '../../components/DateTimePicker';
import { getSystemAdminHref } from '../../lib/adminGuard';
import { useIsMobile } from '../../lib/useIsMobile';
import { useRequireLogin } from '../../lib/useRequireLogin';
import { expandOccurrences, EventRow as RawEventRow } from '../../lib/recurrence';
import {
  getVenues,
  getVenueBlocks,
  getVenueBlockGroups,
  getSettings,
  getEvents,
  getProfiles,
  getSystemAdmins,
} from '../../lib/dataStore';

type Props = {
  venues: Venue[];
  blocks: Block[];
  groups: BlockGroup[];
  slotMin: number;
  availableStart: string;
  availableEnd: string;
  profileId: string | null;
  displayName: string | null;
  contact: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const ReservationGridPage = ({ venues, blocks, groups, slotMin, availableStart, availableEnd, profileId, displayName, contact, nickname, email, systemAdminHref }: Props) => {
  const isMobile = useIsMobile();
  const router = useRouter();
  useRequireLogin(profileId);

  // 예약 확인 모달 + 제출 상태
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [cMember, setCMember] = useState(false);
  const [cCancel, setCCancel] = useState(false);
  const allConfirmed = cMember && cCancel;
  const [shakeDesc, setShakeDesc] = useState(false);
  const [shakeConfirm, setShakeConfirm] = useState(false);
  const shake = (setter: (v: boolean) => void) => { setter(true); setTimeout(() => setter(false), 650); };
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 두 선택 모두 필수 — date 은 기본 오늘로 프리셋, venue 는 미선택 시작
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  // 모든 장소가 기본 선택 — 페이지 진입 즉시 전체 현황이 보이도록
  const [selectedVenueIds, setSelectedVenueIds] = useState<Set<string>>(() => new Set(venues.map((v) => v.id)));
  const [venueOpen, setVenueOpen] = useState(false);
  // 선택 상태 — 단일 장소 + 연속된 시간 슬롯만 허용 (원본 장소예약과 동일한 정책)
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);
  const [activeSlots, setActiveSlots] = useState<Set<number>>(new Set());
  // 날짜·장소(선택 집합)가 바뀌면 셀 선택 초기화
  useEffect(() => { setActiveVenueId(null); setActiveSlots(new Set()); }, [selectedDate, selectedVenueIds]);

  // VenueGrid 에 전달할 Map 형태 (단일 장소만 담음)
  const selectedSlotsMap = useMemo(() => {
    const m = new Map<string, Set<number>>();
    if (activeVenueId && activeSlots.size > 0) m.set(activeVenueId, activeSlots);
    return m;
  }, [activeVenueId, activeSlots]);

  // ---- 드래그 선택 지원 ----
  // pointerDown 으로 anchor 기록 → pointerEnter 로 range 확장 → window pointerup 으로 종료.
  // 이동이 있었으면 draggedRef=true 로 뒤따라오는 onClick 을 무시 (double-mutation 방지).
  const dragAnchorRef = useRef<number | null>(null);
  const dragVenueIdRef = useRef<string | null>(null);
  const draggedRef = useRef(false);

  // 현재 날짜·장소의 '블럭(예약/교회일정/블럭)' 슬롯 Map — 드래그 범위에서 제외용
  const blockedSlotMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    const [py, pm, pd] = selectedDate.split('-').map(Number);
    if (!py || !pm || !pd) return map;
    const endOfDay = 24 * 60;
    // adhoc blocks + 펼친 이벤트 블럭
    for (const b of blocks) {
      const bs = new Date(b.startAt).getTime();
      const be = b.endAt ? new Date(b.endAt).getTime() : Number.POSITIVE_INFINITY;
      for (let mm = 0; mm < endOfDay; mm += slotMin) {
        const slotStart = new Date(py, pm - 1, pd, Math.floor(mm / 60), mm % 60).getTime();
        const slotEnd = slotStart + slotMin * 60000;
        if (bs < slotEnd && be > slotStart) {
          if (!map.has(b.venueId)) map.set(b.venueId, new Set());
          map.get(b.venueId)!.add(mm);
        }
      }
    }
    // 반복 block groups
    const grpMap = computeBlockedSlotsForDate(groups, selectedDate);
    for (const [vid, mins] of grpMap.entries()) {
      if (!map.has(vid)) map.set(vid, new Set());
      for (const mm of mins) map.get(vid)!.add(mm);
    }
    return map;
  }, [blocks, groups, selectedDate, slotMin]);

  useEffect(() => {
    const onUp = () => {
      if (dragAnchorRef.current !== null) {
        dragAnchorRef.current = null;
        dragVenueIdRef.current = null;
        // onClick 이 pointerup 바로 뒤에 발생하므로 약간 지연 후 초기화
        setTimeout(() => { draggedRef.current = false; }, 60);
      }
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const handleSlotPointerDown = (venue: Venue, startMin: number, blocked: boolean) => {
    if (blocked) return;
    dragAnchorRef.current = startMin;
    dragVenueIdRef.current = venue.id;
    draggedRef.current = false;
  };

  const handleSlotPointerEnter = (venue: Venue, startMin: number, _blocked: boolean) => {
    if (dragAnchorRef.current === null) return;
    if (dragVenueIdRef.current !== venue.id) return;
    draggedRef.current = true;
    const anchor = dragAnchorRef.current;
    const blockedForVenue = blockedSlotMap.get(venue.id) || new Set<number>();
    const next = new Set<number>([anchor]);
    // anchor 에서 drag 위치까지 연속 확장 — 첫 블럭 셀을 만나면 거기서 멈춤
    if (startMin > anchor) {
      for (let mm = anchor + slotMin; mm <= startMin; mm += slotMin) {
        if (blockedForVenue.has(mm)) break;
        next.add(mm);
      }
    } else if (startMin < anchor) {
      for (let mm = anchor - slotMin; mm >= startMin; mm -= slotMin) {
        if (blockedForVenue.has(mm)) break;
        next.add(mm);
      }
    }
    setActiveVenueId(venue.id);
    setActiveSlots(next);
  };

  const handleSlotClick = (venue: Venue, startMin: number, blocked: boolean) => {
    // 드래그 직후 onClick 은 무시 (pointerDown+enter 로 이미 선택이 갱신됐음)
    if (draggedRef.current) return;
    if (blocked) return;  // 예약/교회일정/블럭 셀은 클릭 무효

    // 다른 장소 클릭 → 새 선택으로 교체 (첫 셀부터 시작)
    if (activeVenueId !== venue.id) {
      setActiveVenueId(venue.id);
      setActiveSlots(new Set([startMin]));
      return;
    }

    // 같은 장소 내 처리
    if (activeSlots.size === 0) {
      setActiveSlots(new Set([startMin]));
      return;
    }

    // 이미 선택된 셀 클릭 → 그 셀까지만 남기고 잘라내기 (9:00-11:00 상태에서 10:00 클릭 → 9:00-10:30)
    if (activeSlots.has(startMin)) {
      const sorted = Array.from(activeSlots).sort((a, b) => a - b);
      const first = sorted[0];
      if (startMin === first) {
        // 시작 셀 다시 클릭 → 전체 해제
        setActiveSlots(new Set());
        setActiveVenueId(null);
      } else {
        const next = new Set<number>();
        for (let mm = first; mm <= startMin; mm += slotMin) next.add(mm);
        setActiveSlots(next);
      }
      return;
    }

    // 비어있는 셀 클릭 — 연속 여부 판정
    const sorted = Array.from(activeSlots).sort((a, b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (startMin === last + slotMin) {
      // 바로 뒤 연속 → 확장
      const next = new Set(activeSlots);
      next.add(startMin);
      setActiveSlots(next);
    } else if (startMin === first - slotMin) {
      // 바로 앞 연속 → 확장
      const next = new Set(activeSlots);
      next.add(startMin);
      setActiveSlots(next);
    } else {
      // 연속 불가 (떨어진 셀) → 기존 선택 버리고 새로 시작 (사용자가 뛰어넘어 클릭하면 앞쪽 연속 구간 기준 재시작)
      setActiveSlots(new Set([startMin]));
    }
  };

  const totalSelectedSlots = activeSlots.size;
  const clearSelectedSlots = () => { setActiveVenueId(null); setActiveSlots(new Set()); };

  // 선택된 장소·시간 범위 파생값
  const selection = useMemo(() => {
    if (!activeVenueId || totalSelectedSlots === 0) return null;
    const v = venues.find((x) => x.id === activeVenueId);
    if (!v) return null;
    const sorted = Array.from(activeSlots).sort((a, b) => a - b);
    const startMin = sorted[0];
    const endMin = sorted[sorted.length - 1] + slotMin;
    const pad = (n: number) => String(n).padStart(2, '0');
    const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const totalMinutes = endMin - startMin;
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    const totalLabel = hh === 0 ? `${mm}분` : mm === 0 ? `${hh}시간` : `${hh}시간 ${mm}분`;
    return { venue: v, startMin, endMin, startLabel: hhmm(startMin), endLabel: hhmm(endMin), totalLabel };
  }, [activeVenueId, activeSlots, totalSelectedSlots, venues, slotMin]);

  const openConfirmModal = () => {
    if (!selection) return;
    setSubmitError(null);
    setConfirmOpen(true);
  };

  const submitReservation = async () => {
    if (!selection || !profileId) return;
    // 유효성
    let ok = true;
    if (!description.trim()) { shake(setShakeDesc); ok = false; }
    if (!allConfirmed) { shake(setShakeConfirm); ok = false; }
    if (!ok) return;
    // 이름/연락처 누락 방지
    if (!displayName?.trim() || !contact?.trim()) {
      setSubmitError('예약자 이름과 연락처를 먼저 등록해주세요. 대시보드에서 내 정보를 확인하세요.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const [y, mo, d] = selectedDate.split('-').map(Number);
      const startAt = new Date(y, mo - 1, d, Math.floor(selection.startMin / 60), selection.startMin % 60).toISOString();
      const endAt = new Date(y, mo - 1, d, Math.floor(selection.endMin / 60), selection.endMin % 60).toISOString();
      const v = selection.venue;
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: 'kcis',
          profileId,
          title: description.trim(),
          description: description.trim(),
          startAt, endAt,
          venueId: v.id,
          location: `${v.floor} ${v.name}(${v.code})`,
          scope: 'personal',
          type: 'reservation',
          createdByName: displayName || nickname || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        setSubmitError(j?.error || '예약 실패');
        setSubmitting(false);
        return;
      }
      alert(`예약이 완료되었습니다.\n\n${selectedDate} ${selection.startLabel}~${selection.endLabel}\n${v.floor} ${v.name}\n\n나의 장소예약 페이지로 이동합니다.`);
      const qs = new URLSearchParams();
      if (profileId) qs.set('profileId', profileId);
      if (displayName) qs.set('nickname', displayName);
      if (email) qs.set('email', email);
      router.push(`/reservations/my${qs.toString() ? `?${qs.toString()}` : ''}`);
    } catch (e: any) {
      setSubmitError(e?.message || '예약 중 오류가 발생했습니다.');
      setSubmitting(false);
    }
  };

  const selDow = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    if (!y || !m || !d) return 0;
    return new Date(y, m - 1, d).getDay();
  }, [selectedDate]);
  const isToday = selectedDate === todayKey;

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

  const selectedVenues = useMemo(
    () => venues.filter((v) => selectedVenueIds.has(v.id)),
    [venues, selectedVenueIds],
  );

  const toggleVenue = (id: string) => {
    setSelectedVenueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleFloor = (floor: string) => {
    setSelectedVenueIds((prev) => {
      const next = new Set(prev);
      const floorIds = venues.filter((v) => v.floor === floor).map((v) => v.id);
      const allOn = floorIds.every((id) => next.has(id));
      if (allOn) floorIds.forEach((id) => next.delete(id));
      else floorIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const selectAllVenues = () => setSelectedVenueIds(new Set(venues.map((v) => v.id)));
  const clearVenues = () => setSelectedVenueIds(new Set());

  const dowColor = selDow === 0 ? '#DC2626' : selDow === 6 ? '#2563EB' : 'var(--color-ink)';
  const dowBg = selDow === 0 ? '#FEE2E2' : selDow === 6 ? '#DBEAFE' : '#F3F4F6';

  const [, m, d] = selectedDate.split('-');
  const dateSummary = `${m}/${d} (${WEEK_LABELS[selDow]})${isToday ? ' · 오늘' : ''}`;
  const venueSummary = (() => {
    const n = selectedVenueIds.size;
    if (n === 0) return null;
    if (n === 1) {
      const v = selectedVenues[0];
      return `${v.floor} ${v.name}`;
    }
    return `${selectedVenues[0].floor} ${selectedVenues[0].name} 외 ${n - 1}곳`;
  })();

  const hasBoth = selectedVenueIds.size > 0;

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

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '1rem 0.5rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: isMobile ? '0.85rem' : '1rem' }}>
        <section
          style={{
            padding: isMobile ? '0.85rem 0.75rem' : '1.1rem 1.2rem',
            borderRadius: 16,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-surface-border)',
            boxShadow: 'var(--shadow-card)',
            display: 'grid',
            gap: isMobile ? '0.85rem' : '1rem',
          }}
        >
          <h1 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.3rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>📍 장소예약</h1>

          {/* 상단: 날짜 선택(달력 직접) + 장소 선택 버튼 (나란히) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '0.5rem' : '0.75rem' }}>
            {/* 날짜 — 클릭 시 달력 바로 열림 */}
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-primary-deep)', letterSpacing: '0.02em' }}>📅 날짜</span>
              <DateTimePicker
                dateOnly
                value={`${selectedDate}T00:00`}
                onChange={(v) => setSelectedDate(v.slice(0, 10))}
                placeholder="날짜 선택"
                buttonStyle={{
                  width: '100%',
                  padding: isMobile ? '0.7rem 0.8rem' : '0.8rem 0.95rem',
                  minHeight: 48,
                  borderRadius: 12,
                  border: '1.5px solid var(--color-primary)',
                  fontWeight: 800,
                  fontSize: isMobile ? '0.95rem' : '1rem',
                  textAlign: 'center',
                  color: 'var(--color-ink)',
                  background: '#fff',
                }}
              />
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: 999,
                  background: dowBg, color: dowColor,
                  fontSize: '0.76rem', fontWeight: 800,
                }}>{WEEK_LABELS[selDow]}</span>
                {isToday && (
                  <span style={{ padding: '0.15rem 0.55rem', borderRadius: 999, background: '#ECFDF5', border: '1px solid #20CD8D', color: 'var(--color-primary-deep)', fontSize: '0.7rem', fontWeight: 800 }}>오늘</span>
                )}
              </div>
            </div>

            {/* 장소 — 클릭 시 장소 선택 모달 */}
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: venueSummary ? 'var(--color-primary-deep)' : '#6B7280', letterSpacing: '0.02em' }}>📍 장소 {venueSummary ? `(${selectedVenueIds.size})` : '(미선택)'}</span>
              <button
                type="button"
                onClick={() => {
                  // 아무것도 선택 안 된 상태로 모달을 열면 혼란 → 전체를 기본 선택해서 열기
                  if (selectedVenueIds.size === 0) setSelectedVenueIds(new Set(venues.map((v) => v.id)));
                  setVenueOpen(true);
                }}
                style={{
                  width: '100%',
                  padding: isMobile ? '0.7rem 0.8rem' : '0.8rem 0.95rem',
                  minHeight: 48,
                  borderRadius: 12,
                  border: venueSummary ? '1.5px solid var(--color-primary)' : '1.5px dashed #9CA3AF',
                  background: venueSummary ? '#fff' : '#F9FAFB',
                  color: venueSummary ? 'var(--color-ink)' : 'var(--color-ink-2)',
                  cursor: 'pointer',
                  fontWeight: venueSummary ? 800 : 600,
                  fontSize: isMobile ? '0.95rem' : '1rem',
                  textAlign: 'center',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {venueSummary || '선택하기'}
              </button>
              {/* 날짜와 라인 맞추기 위한 빈 공간 (요일 pill 줄에 대응) */}
              <div style={{ minHeight: 24 }} />
            </div>
          </div>

          {/* 본문: 두 조건 모두 만족 시 그리드, 아니면 안내 */}
          {hasBoth ? (
            <>
              {/* 범례 */}
              <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '0.85rem', fontSize: '0.76rem', color: 'var(--color-ink-2)', flexWrap: 'wrap', alignItems: 'center', rowGap: '0.4rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#F7FEE7', border: '1px solid #D9F09E' }} /> 예약 가능
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#DC2626' }} /> 교회일정
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#2563EB', outline: '2px solid #FBBF24', outlineOffset: -1 }} /> ⭐ 내 예약
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#9CA3AF' }} /> 타인 예약
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#4B5563' }} /> 예약불가
                </span>
              </div>

              <VenueGrid
                venues={selectedVenues}
                blocks={blocks}
                groups={groups}
                selectedDate={selectedDate}
                slotMin={slotMin}
                availableStart={availableStart}
                availableEnd={availableEnd}
                selectedSlots={selectedSlotsMap}
                onSlotClick={handleSlotClick}
                onSlotPointerDown={handleSlotPointerDown}
                onSlotPointerEnter={handleSlotPointerEnter}
              />

              {/* 선택 요약 + 예약하기 바로가기 */}
              {selection ? (
                <div style={{
                  display: 'flex', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: '0.55rem',
                  padding: '0.7rem 0.9rem', borderRadius: 12,
                  background: '#ECFDF5', border: '1px solid #20CD8D',
                }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-primary-deep)', lineHeight: 1.4 }}>
                    ✓ {selection.venue.floor} {selection.venue.name} · {selection.startLabel}~{selection.endLabel} ({selection.totalLabel})
                  </span>
                  <div style={{ display: 'flex', gap: '0.35rem', marginLeft: isMobile ? 0 : 'auto' }}>
                    <button
                      type="button"
                      onClick={openConfirmModal}
                      style={{ flex: isMobile ? 1 : undefined, padding: '0.45rem 0.95rem', minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}
                    >✓ 예약하기</button>
                  </div>
                </div>
              ) : null}
              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--color-ink-2)' }}>
                {dateSummary} · {selectedVenueIds.size}곳 현황
              </p>
            </>
          ) : (
            <div style={{
              padding: isMobile ? '1.75rem 1rem' : '2.25rem 1.25rem',
              borderRadius: 12,
              background: '#F9FAFB',
              border: '1px dashed var(--color-gray)',
              textAlign: 'center',
              color: 'var(--color-ink-2)',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.35rem' }}>🎯</div>
              <p style={{ margin: 0, fontSize: isMobile ? '0.92rem' : '1rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                날짜와 장소를 선택해주세요
              </p>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', lineHeight: 1.6 }}>
                두 항목 모두 선택되면 해당 날짜·장소의 예약 현황 그리드가 표시됩니다.
              </p>
            </div>
          )}
        </section>
      </main>

      {/* 장소 선택 모달 */}
      {venueOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setVenueOpen(false); }}
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
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)' }}>📍 장소 선택</h3>
              <button type="button" onClick={() => setVenueOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40 }}>✕</button>
            </div>
            <div style={{ padding: '0.9rem 1rem', overflowY: 'auto', display: 'grid', gap: '0.7rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>{selectedVenueIds.size}/{venues.length} 선택됨</span>
                <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                  <button type="button" onClick={selectAllVenues} style={{ padding: '0.4rem 0.7rem', minHeight: 36, borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>전체 선택</button>
                  <button type="button" onClick={clearVenues} style={{ padding: '0.4rem 0.7rem', minHeight: 36, borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>전체 해제</button>
                </div>
              </div>

              {venuesByFloor.map(([floor, list]) => {
                const floorIds = list.map((v) => v.id);
                const floorAllOn = floorIds.length > 0 && floorIds.every((id) => selectedVenueIds.has(id));
                const floorSomeOn = floorIds.some((id) => selectedVenueIds.has(id));
                return (
                  <div key={floor} style={{ padding: '0.55rem 0.65rem', border: '1px solid var(--color-surface-border)', borderRadius: 10, background: '#FAFAF7', display: 'grid', gap: '0.45rem' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem', fontWeight: 800, color: '#3F6212', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={floorAllOn}
                        ref={(el) => { if (el) el.indeterminate = !floorAllOn && floorSomeOn; }}
                        onChange={() => toggleFloor(floor)}
                        style={{ width: 18, height: 18, accentColor: '#65A30D' }}
                      />
                      {floor}
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {list.map((v) => {
                        const on = selectedVenueIds.has(v.id);
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
                            <input type="checkbox" checked={on} onChange={() => toggleVenue(v.id)} style={{ width: 16, height: 16, accentColor: '#65A30D' }} />
                            <span style={{ color: 'var(--color-ink)', fontWeight: on ? 800 : 600 }}>{v.name}</span>
                            <span style={{ color: 'var(--color-ink-2)', fontFamily: 'monospace', fontSize: '0.72rem' }}>({v.code})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--color-surface-border)' }}>
              <button
                type="button"
                onClick={() => setVenueOpen(false)}
                disabled={selectedVenueIds.size === 0}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem', minHeight: 48,
                  borderRadius: 12, border: 'none',
                  background: selectedVenueIds.size === 0 ? '#9CA3AF' : 'var(--color-primary)',
                  color: '#fff',
                  fontWeight: 800, fontSize: '0.98rem',
                  cursor: selectedVenueIds.size === 0 ? 'not-allowed' : 'pointer',
                }}
              >{selectedVenueIds.size === 0 ? '장소를 1개 이상 선택하세요' : `적용 (${selectedVenueIds.size}곳)`}</button>
            </div>
          </div>
        </div>
      )}

      {/* 예약전 정보확인 모달 */}
      {confirmOpen && selection && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setConfirmOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 95, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : '1rem' }}
        >
          <style>{`@keyframes kcisShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }`}</style>
          <div role="dialog" aria-modal="true" style={{
            width: '100%', maxWidth: 520, maxHeight: isMobile ? '92vh' : '90vh',
            background: '#fff',
            borderRadius: isMobile ? '18px 18px 0 0' : 16,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)' }}>📍 예약전 정보확인</h3>
              <button type="button" onClick={() => !submitting && setConfirmOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: submitting ? 'not-allowed' : 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40, opacity: submitting ? 0.5 : 1 }}>✕</button>
            </div>

            <div style={{ padding: '1rem', overflowY: 'auto', display: 'grid', gap: '0.85rem' }}>
              {/* 예약자 정보 */}
              <div style={{ padding: '0.75rem 0.9rem', borderRadius: 12, background: '#FFF7ED', border: '1px solid #FED7AA', display: 'grid', gap: '0.4rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#9A3412', letterSpacing: '0.02em' }}>👤 예약자 정보</div>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '0.4rem', fontSize: '0.92rem' }}>
                  <span style={{ color: '#9A3412', fontWeight: 800 }}>이름</span>
                  <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{displayName || '(미등록)'}</span>
                  <span style={{ color: '#9A3412', fontWeight: 800 }}>연락처</span>
                  <span style={{ color: 'var(--color-ink)', fontWeight: 700, fontFamily: 'monospace' }}>{contact || '(미등록)'}</span>
                </div>
              </div>

              {/* 일시·장소 */}
              <div style={{ padding: '0.75rem 0.9rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E', display: 'grid', gap: '0.4rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#3F6212', letterSpacing: '0.02em' }}>📅 예약 일시 · 장소</div>
                <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '0.4rem 0.5rem', fontSize: '0.92rem', alignItems: 'baseline' }}>
                  <span style={{ color: '#3F6212', fontWeight: 800 }}>일시</span>
                  <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>
                    {selectedDate} ({WEEK_LABELS[selDow]}) {selection.startLabel}~{selection.endLabel}
                    <span style={{ marginLeft: '0.35rem', color: 'var(--color-ink-2)', fontWeight: 600 }}>({selection.totalLabel})</span>
                  </span>
                  <span style={{ color: '#3F6212', fontWeight: 800 }}>장소</span>
                  <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{selection.venue.floor} {selection.venue.name}</span>
                </div>
              </div>

              {/* 예약 설명 */}
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-ink)' }}>
                  예약 설명 <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="예: 청년부 주중모임, 3구역 구역예배"
                  maxLength={80}
                  style={{
                    width: '100%',
                    padding: '0.7rem 0.85rem',
                    minHeight: 44,
                    borderRadius: 10,
                    border: shakeDesc ? '2px solid #DC2626' : '1px solid var(--color-gray)',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    background: '#fff',
                    boxSizing: 'border-box',
                    animation: shakeDesc ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
                    transition: 'border-color 0.2s ease',
                  }}
                />
              </div>

              {/* 확인 체크리스트 */}
              <div style={{
                padding: '0.75rem 0.9rem', borderRadius: 12,
                background: '#FEF3C7',
                border: shakeConfirm ? '2px solid #DC2626' : '1px solid #FBBF24',
                display: 'grid', gap: '0.4rem',
                animation: shakeConfirm ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
                transition: 'border-color 0.2s ease',
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#92400E', letterSpacing: '0.02em' }}>⚠️ 예약전 확인사항</div>
                {[
                  { checked: cMember, setter: setCMember, label: '싱가폴한인교회 등록교인이며, 실명과 연락가능한 번호를 올바르게 입력했습니다.' },
                  { checked: cCancel, setter: setCCancel, label: '잘못된 정보를 입력할 경우, 사전통보 없이 예약이 취소될 수 있음을 인지했습니다.' },
                ].map((item, i) => (
                  <label key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.7rem',
                    padding: '0.4rem 0',
                    fontSize: '0.92rem',
                    color: '#78350F', fontWeight: 700, lineHeight: 1.5, cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={item.checked} onChange={(e) => item.setter(e.target.checked)} style={{ marginTop: '0.1rem', accentColor: '#D97706', flexShrink: 0, width: 24, height: 24 }} />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              {submitError && (
                <p style={{ margin: 0, padding: '0.5rem 0.7rem', borderRadius: 8, background: '#FEE2E2', color: '#B91C1C', fontSize: '0.84rem', fontWeight: 700 }}>⚠ {submitError}</p>
              )}
            </div>

            <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={submitReservation}
                disabled={submitting}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem', minHeight: 52,
                  borderRadius: 12, border: 'none',
                  background: submitting ? '#9CA3AF' : 'var(--color-primary)',
                  color: '#fff', fontWeight: 800, fontSize: '1rem',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(32,205,141,0.25)',
                }}
              >{submitting ? '저장 중...' : '✓ 예약 진행하기'}</button>
              {!submitting && (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  style={{ width: '100%', padding: '0.55rem 1rem', minHeight: 40, borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
                >취소</button>
              )}
            </div>
          </div>
        </div>
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
    if (kind === 'reservation' && isOwner) block.mine = true;
    if (reserverName) block.reserverName = reserverName;
    if (reserverContact) block.reserverContact = reserverContact;
    eventBlocks.push(block);
  }
  const adhocTyped: Block[] = adhocBlocks.map((b) => ({ ...b, kind: b.kind || 'block' }));
  const blocks: Block[] = [...adhocTyped, ...eventBlocks];
  const settings = (settingsObj || {}) as { venueSlotMin?: number; venueAvailableStart?: string; venueAvailableEnd?: string };
  const slotMin = settings.venueSlotMin === 60 ? 60 : 30;
  const availableStart = typeof settings.venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableStart) ? settings.venueAvailableStart : '06:00';
  const availableEnd = typeof settings.venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableEnd) ? settings.venueAvailableEnd : '22:00';

  const profileId = queryProfileId;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;

  let displayName: string | null = nickname;
  let contact: string | null = null;
  if (profileId) {
    try {
      const p = (profilesArr as Array<any>).find((x) => x.profileId === profileId);
      displayName = p?.realName || nickname || null;
      contact = p?.contact || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });

  return { props: { venues, blocks, groups, slotMin, availableStart, availableEnd, profileId, displayName, contact, nickname, email, systemAdminHref } };
};

export default ReservationGridPage;
