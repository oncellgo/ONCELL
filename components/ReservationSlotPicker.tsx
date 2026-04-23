import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import VenueGrid, { Venue, Block, BlockGroup, computeBlockedSlotsForDate } from './VenueGrid';
import DateTimePicker from './DateTimePicker';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 공용 예약 슬롯 선택 컴포넌트 — create(신규 예약) + edit(기존 예약 수정) 양쪽에 사용.
 * 원래 pages/reservations/grid.tsx 에 있던 picker 로직(드래그 선택·연속 슬롯·충돌 감지·한도 체크·
 * 예약전 확인 모달)을 하나로 응집해 중복 없이 두 흐름에서 동일하게 사용.
 *
 * 사용 예:
 *   <ReservationSlotPicker mode="create" venues={...} ... />
 *   <ReservationSlotPicker mode="edit" venues={[fixedVenue]} editReservation={...} ... />
 *
 * API 호출:
 *   - create: POST /api/events
 *   - edit:   PATCH /api/events (seriesId + occurrenceDate + fields)
 */
export type EditReservationPayload = {
  id: string;
  seriesId?: string | null;
  dateKey?: string | null;
  date: string;
  venueId: string;
  startMin: number;
  endMin: number;
  description: string;
};

export type ReservationSlotPickerProps = {
  mode: 'create' | 'edit';
  venues: Venue[];
  blocks: Block[];
  groups: BlockGroup[];
  slotMin: number;
  availableStart: string;
  availableEnd: string;
  reservationLimitMode: 'unlimited' | 'perUser';
  reservationLimitPerUser: number;
  /** 예약 가능 기간 — 현재날짜부터 N개월 이내. 기본 1. 관리자는 서버에서 예외 처리. */
  bookingWindowMonths?: 1 | 2 | 3 | 6;
  profileId: string | null;
  displayName: string | null;
  contact: string | null;
  nickname: string | null;
  email: string | null;
  /** 시스템관리자 여부 — 범례에 관리자 전용 안내 표시. */
  isAdmin?: boolean;
  // edit-only:
  editReservation?: EditReservationPayload;
  // 성공 후 호출: create 는 /reservations/my 로 이동 직전, edit 는 모달 닫고 목록 리로드
  onSubmitted?: () => void;
  // edit 모달에서 닫기/취소
  onCancel?: () => void;
};

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const dateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const ReservationSlotPicker = ({
  mode,
  venues,
  blocks,
  groups,
  slotMin,
  availableStart,
  availableEnd,
  reservationLimitMode,
  reservationLimitPerUser,
  bookingWindowMonths = 1,
  profileId,
  displayName,
  contact,
  nickname,
  email,
  isAdmin = false,
  editReservation,
  onSubmitted,
  onCancel,
}: ReservationSlotPickerProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  // SSR 에서 profileId 누락 → liveName/contact 를 /api/profile 로 재조회.
  const [liveName, setLiveName] = useState<string | null>(displayName);
  const [liveContact, setLiveContact] = useState<string | null>(contact);
  useEffect(() => {
    const needName = !liveName || !String(liveName).trim();
    const needContact = !liveContact || !String(liveContact).trim();
    if (!needName && !needContact) return;
    let pid = profileId;
    if (!pid) {
      try { pid = window.localStorage.getItem('kcisProfileId'); } catch {}
    }
    if (!pid) return;
    fetch(`/api/profile?profileId=${encodeURIComponent(pid)}`)
      .then((r) => r.json())
      .then((d) => {
        const p = d?.profile;
        if (!p) return;
        if (needName && (p.realName || p.nickname)) setLiveName(p.realName || p.nickname);
        if (needContact && p.contact) setLiveContact(p.contact);
      })
      .catch(() => {});
    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ realName?: string; contact?: string }>).detail;
      if (detail?.realName) setLiveName(detail.realName);
      if (detail?.contact) setLiveContact(detail.contact);
    };
    window.addEventListener('kcis-profile-updated', onUpdated);
    return () => window.removeEventListener('kcis-profile-updated', onUpdated);
  }, [profileId, liveName, liveContact]);

  // 예약 확인 모달 + 제출 상태
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [description, setDescription] = useState(editReservation?.description || '');
  const [cMember, setCMember] = useState(mode === 'edit');
  const [cCancel, setCCancel] = useState(mode === 'edit');
  // 최초 예약(이름/연락처 비어있음) 시에만 받는 추가 수집 동의
  const [cInfoCollect, setCInfoCollect] = useState(false);
  // 모달 안에서 편집 가능한 예약자 이름·연락처. 확인 모달 열릴 때 prefill.
  const [stagedName, setStagedName] = useState('');
  const [stagedContact, setStagedContact] = useState('');
  // "최초 수집" 여부는 모달 열릴 시점의 값으로 고정 (입력하면 바뀌어도 동의는 유지 필요)
  const [initialMissing, setInitialMissing] = useState(false);
  const allConfirmed = cMember && cCancel && (!initialMissing || cInfoCollect);
  // 예약자 정보 섹션 인라인 에러 (이름·연락처 비었을 때)
  const [stagedInfoError, setStagedInfoError] = useState<string | null>(null);
  const [shakeDesc, setShakeDesc] = useState(false);
  const [shakeConfirm, setShakeConfirm] = useState(false);
  const shake = (setter: (v: boolean) => void) => { setter(true); setTimeout(() => setter(false), 650); };
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ date: string; start: string; end: string; venue: string } | null>(null);

  // 기본 날짜: edit 모드 → editReservation.date, create → 오늘
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(editReservation?.date || todayKey);

  // 모든 장소 기본 선택 (create) / edit 는 고정된 한 곳만
  const [selectedVenueIds, setSelectedVenueIds] = useState<Set<string>>(() => {
    if (mode === 'edit' && editReservation) return new Set([editReservation.venueId]);
    return new Set(venues.map((v) => v.id));
  });
  const [venueOpen, setVenueOpen] = useState(false);

  // 선택 상태 — 단일 장소 + 연속된 시간 슬롯만 허용
  const [activeVenueId, setActiveVenueId] = useState<string | null>(
    editReservation ? editReservation.venueId : null,
  );
  // edit 모드에서도 `activeSlots` 는 시작 시 비워둔다 — 원래 예약은 ghostSlots 로 지속 표시,
  // 사용자가 '새 시간'을 클릭/드래그로 선택하면 민트(selectedSlots) 로 따로 표시되어 둘이 구분된다.
  const [activeSlots, setActiveSlots] = useState<Set<number>>(() => new Set());

  // 원래 예약 ghost: edit 모드에서만 set. selectedDate 가 원본 예약 날짜와 같을 때만 표시.
  const ghostSlotsMap = useMemo(() => {
    const m = new Map<string, Set<number>>();
    if (mode !== 'edit' || !editReservation) return m;
    if (selectedDate !== editReservation.date) return m;
    const set = new Set<number>();
    for (let mm = editReservation.startMin; mm < editReservation.endMin; mm += slotMin) set.add(mm);
    m.set(editReservation.venueId, set);
    return m;
  }, [mode, editReservation, selectedDate, slotMin]);

  // create: 날짜/장소 바뀌면 선택 초기화.
  // edit: 날짜가 **원래 예약 날짜와 다른 날로 변경되었을 때만** 초기화.
  //   → mount 시점에 selectedDate === editReservation.date 이라 초기 pre-select 가 유지됨.
  const mountedDateRef = useRef(selectedDate);
  useEffect(() => {
    if (mode === 'edit') {
      // 초기값과 다를 때만 초기화 (mount 직후 ref 와 동일하면 skip)
      if (selectedDate !== mountedDateRef.current) {
        setActiveSlots(new Set());
        setActiveVenueId(editReservation?.venueId || null);
        mountedDateRef.current = selectedDate;
      }
    } else {
      setActiveVenueId(null);
      setActiveSlots(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);
  useEffect(() => {
    if (mode === 'create') {
      setActiveVenueId(null);
      setActiveSlots(new Set());
    } else if (mode === 'edit') {
      // edit 모드: 사용자가 장소를 바꾸면 시간을 다시 선택해야 한다 (ghost 는 원래 장소일 때만 표시)
      setActiveSlots(new Set());
      setActiveVenueId(Array.from(selectedVenueIds)[0] || null);
    }
  }, [selectedVenueIds, mode]);

  // VenueGrid 에 전달할 Map
  const selectedSlotsMap = useMemo(() => {
    const m = new Map<string, Set<number>>();
    if (activeVenueId && activeSlots.size > 0) m.set(activeVenueId, activeSlots);
    return m;
  }, [activeVenueId, activeSlots]);

  // ---- 드래그 선택 ----
  const dragAnchorRef = useRef<number | null>(null);
  const dragVenueIdRef = useRef<string | null>(null);
  const draggedRef = useRef(false);

  // edit 모드: 자기 자신 예약은 "블럭"으로 취급하지 않도록 VenueGrid 에도 제외해서 전달.
  // (원래 슬롯은 activeSlots 초기값으로 선택된 상태로 표시되므로 "내 예약 표시 = 선택 하이라이트"로 대체)
  const visibleBlocks = useMemo(() => {
    if (mode !== 'edit' || !editReservation) return blocks;
    return blocks.filter((b) => !(b.id && b.id.includes(editReservation.id)));
  }, [blocks, mode, editReservation]);

  const blockedSlotMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    const [py, pm, pd] = selectedDate.split('-').map(Number);
    if (!py || !pm || !pd) return map;
    const endOfDay = 24 * 60;
    for (const b of blocks) {
      // edit 모드에서 자기 자신 예약은 "블럭"에서 제외해 그 위를 재선택할 수 있게 함
      if (mode === 'edit' && editReservation && b.id && b.id.includes(editReservation.id)) continue;
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
    const grpMap = computeBlockedSlotsForDate(groups, selectedDate);
    for (const [vid, mins] of grpMap.entries()) {
      if (!map.has(vid)) map.set(vid, new Set());
      for (const mm of mins) map.get(vid)!.add(mm);
    }
    return map;
  }, [blocks, groups, selectedDate, slotMin, mode, editReservation]);

  useEffect(() => {
    const onUp = () => {
      if (dragAnchorRef.current !== null) {
        dragAnchorRef.current = null;
        dragVenueIdRef.current = null;
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
    if (draggedRef.current) return;
    if (blocked) return;

    if (activeVenueId !== venue.id) {
      setActiveVenueId(venue.id);
      setActiveSlots(new Set([startMin]));
      return;
    }

    if (activeSlots.size === 0) {
      setActiveSlots(new Set([startMin]));
      return;
    }

    if (activeSlots.has(startMin)) {
      const sorted = Array.from(activeSlots).sort((a, b) => a - b);
      const first = sorted[0];
      if (startMin === first) {
        setActiveSlots(new Set());
        if (mode === 'create') setActiveVenueId(null);
      } else {
        const next = new Set<number>();
        for (let mm = first; mm <= startMin; mm += slotMin) next.add(mm);
        setActiveSlots(next);
      }
      return;
    }

    const sorted = Array.from(activeSlots).sort((a, b) => a - b);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (startMin === last + slotMin) {
      const next = new Set(activeSlots);
      next.add(startMin);
      setActiveSlots(next);
    } else if (startMin === first - slotMin) {
      const next = new Set(activeSlots);
      next.add(startMin);
      setActiveSlots(next);
    } else {
      setActiveSlots(new Set([startMin]));
    }
  };

  const totalSelectedSlots = activeSlots.size;

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

  const resolveEffectiveProfileId = (): string | null => {
    let pid: string | null = profileId;
    if (!pid) {
      try { pid = window.localStorage.getItem('kcisProfileId'); } catch {}
    }
    return pid;
  };

  const openConfirmModal = async () => {
    if (!selection) return;
    setSubmitError(null);
    const effPid = resolveEffectiveProfileId();
    // edit 모드는 한도 체크 skip (기존 예약 수정이므로 새 건수 증가 아님)
    if (mode === 'create' && effPid && reservationLimitMode === 'perUser') {
      try {
        const r = await fetch(`/api/events?communityId=kcis&profileId=${encodeURIComponent(effPid)}&type=reservation`);
        if (r.ok) {
          const d = await r.json();
          const all: any[] = Array.isArray(d?.events) ? d.events : [];
          const nowTs = Date.now();
          const futureCnt = all.filter((x) => new Date(x.endAt).getTime() > nowTs).length;
          if (futureCnt >= reservationLimitPerUser) {
            alert(`예약 한도(${reservationLimitPerUser}건)를 초과했습니다.\n기존 예약 중 하나를 취소한 뒤 다시 시도해주세요.`);
            const qs = new URLSearchParams();
            if (effPid) qs.set('profileId', effPid);
            if (nickname) qs.set('nickname', nickname);
            if (email) qs.set('email', email);
            qs.set('focus', 'my-reservations');
            window.location.href = `/dashboard?${qs.toString()}#my-reservations`;
            return;
          }
        }
      } catch { /* 네트워크 실패 시 모달 열고 서버 재검증 */ }
    }
    // 모달 열릴 때 예약자 정보 prefill + 최초 수집 여부 스냅샷
    const initName = liveName || displayName || nickname || '';
    const initContact = liveContact || contact || '';
    setStagedName(String(initName));
    setStagedContact(String(initContact));
    setInitialMissing(!String(initName).trim() || !String(initContact).trim());
    setCInfoCollect(false);
    setStagedInfoError(null);
    setConfirmOpen(true);
  };

  const submitReservation = async () => {
    if (!selection) {
      setSubmitError('시간/장소 선택이 초기화되었습니다. 모달을 닫고 다시 선택해 주세요.');
      return;
    }
    const effPid = resolveEffectiveProfileId();
    if (!effPid) {
      setSubmitError('로그인이 만료되었습니다. 다시 로그인 후 시도해 주세요.');
      return;
    }
    let ok = true;
    if (!description.trim()) { shake(setShakeDesc); ok = false; }
    if (!allConfirmed) { shake(setShakeConfirm); ok = false; }
    if (!ok) return;
    const effName = String(stagedName || '').trim();
    const effContact = String(stagedContact || '').trim();
    if (!effName || !effContact) {
      setStagedInfoError('예약자 이름과 연락처를 입력해주세요.');
      setSubmitError(null);
      return;
    }
    setStagedInfoError(null);

    // 예약자 정보 수정·최초 입력 → complete-signup 을 호출해 signup_approvals 와 profiles
    // 양쪽 모두 upsert (회원 정보 갱신). 실패해도 예약 자체는 계속 진행.
    const origName = String(liveName || displayName || nickname || '').trim();
    const origContact = String(liveContact || contact || '').trim();
    if (effName !== origName || effContact !== origContact) {
      try {
        await fetch('/api/auth/complete-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: effPid,
            realName: effName,
            contact: effContact,
          }),
        });
        setLiveName(effName);
        setLiveContact(effContact);
        try { window.dispatchEvent(new CustomEvent('kcis-profile-updated', { detail: { realName: effName, contact: effContact } })); } catch {}
      } catch (e) {
        console.error('[reservation] member info upsert failed', e);
      }
    }
    // 과거 시간 + 예약 가능 기간 초과 체크 (서버에서도 방어되지만 클라 경고를 먼저)
    {
      const [y, mo, d] = selectedDate.split('-').map(Number);
      const startMs = new Date(y, mo - 1, d, Math.floor(selection.startMin / 60), selection.startMin % 60).getTime();
      if (startMs < Date.now()) {
        setSubmitError('지난 시간은 예약할 수 없습니다. 다른 시간을 선택해주세요.');
        return;
      }
      const limitDate = new Date();
      limitDate.setMonth(limitDate.getMonth() + bookingWindowMonths);
      limitDate.setHours(23, 59, 59, 999);
      if (startMs > limitDate.getTime()) {
        setSubmitError(`현재 날짜부터 ${bookingWindowMonths}개월 이내 날짜만 예약할 수 있습니다.`);
        return;
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const [y, mo, d] = selectedDate.split('-').map(Number);
      const startAt = new Date(y, mo - 1, d, Math.floor(selection.startMin / 60), selection.startMin % 60).toISOString();
      const endAt = new Date(y, mo - 1, d, Math.floor(selection.endMin / 60), selection.endMin % 60).toISOString();
      const v = selection.venue;

      if (mode === 'edit' && editReservation) {
        // PATCH — 기존 예약의 overrides[occurrenceDate] 를 통해 시각·제목·장소 수정
        const seriesId = editReservation.seriesId || editReservation.id;
        const occurrenceDate = editReservation.dateKey || editReservation.date;
        const res = await fetch('/api/events', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seriesId,
            occurrenceDate,
            profileId: effPid,
            fields: {
              title: description.trim(),
              description: description.trim(),
              startAt,
              endAt,
              venueId: v.id,
              location: `${v.floor} ${v.name}(${v.code})`,
            },
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({} as any));
          setSubmitError(j?.error || '수정 실패');
          setSubmitting(false);
          return;
        }
        setConfirmOpen(false);
        onSubmitted?.();
        return;
      }

      // create — POST
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId: 'kcis',
          profileId: effPid,
          title: description.trim(),
          description: description.trim(),
          startAt, endAt,
          venueId: v.id,
          location: `${v.floor} ${v.name}(${v.code})`,
          scope: 'personal',
          type: 'reservation',
          createdByName: effName || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        setSubmitError(j?.error || '예약 실패');
        setSubmitting(false);
        return;
      }
      setConfirmOpen(false);
      setSubmitting(false);
      setSuccessModal({
        date: selectedDate,
        start: selection.startLabel,
        end: selection.endLabel,
        venue: `${v.floor} ${v.name}`,
      });
    } catch (e: any) {
      setSubmitError(e?.message || '처리 중 오류가 발생했습니다.');
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
    const sorted = [...selectedVenues].sort((a, b) =>
      `${a.floor} ${a.name}`.localeCompare(`${b.floor} ${b.name}`, 'ko'),
    );
    const head = sorted[0];
    if (n === 1) return `${head.floor} ${head.name}`;
    return `${head.floor} ${head.name} 외 ${n - 1}곳`;
  })();

  const hasBoth = selectedVenueIds.size > 0;
  // edit 모드에서 현재 선택된 장소 (한 곳). selectedVenueIds 가 비어있지 않으면 그 첫 번째 장소.
  const editCurrentVenue = mode === 'edit'
    ? venues.find((v) => selectedVenueIds.has(v.id))
    : null;

  // 편집 모드 — 원본 예약 스냅샷 (변경 요약용)
  const originalEditSummary = mode === 'edit' && editReservation ? (() => {
    const v = venues.find((x) => x.id === editReservation.venueId);
    const venueLabel = v ? `${v.floor} ${v.name}` : '';
    const mmToHHMM = (mm: number) => `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
    const dKey = editReservation.dateKey || editReservation.date || '';
    const [y, m, d] = dKey.split('-');
    const dateLabel = y && m && d ? `${Number(m)}/${Number(d)}` : dKey;
    return { venueLabel, dateLabel, range: `${mmToHHMM(editReservation.startMin)}~${mmToHHMM(editReservation.endMin)}` };
  })() : null;

  return (
    <>
      {/* 편집 모드 안내 띠 — 덮어쓰기 동작을 매번 상기 */}
      {mode === 'edit' && (
        <div
          role="note"
          style={{
            padding: '0.55rem 0.8rem',
            borderRadius: 10,
            background: '#F0FDF4',
            border: '1px solid #86EFAC',
            color: '#065F46',
            fontSize: '0.82rem',
            fontWeight: 700,
            lineHeight: 1.5,
            wordBreak: 'keep-all',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span aria-hidden style={{ fontSize: '0.95rem', lineHeight: 1, flexShrink: 0 }}>ℹ️</span>
          <span>새로 선택한 시간이 기존 예약을 대체합니다</span>
        </div>
      )}
      {/* 상단: 날짜 + 장소 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '0.5rem' : '0.75rem' }}>
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-primary-deep)', letterSpacing: '0.02em' }}>
            📅 날짜 <span style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--color-ink-2)' }}>(오늘부터 {bookingWindowMonths}개월 이내)</span>
          </span>
          {(() => {
            // 날짜 선택 범위: 오늘 ~ 오늘 + bookingWindowMonths 개월. 과거/범위초과 날짜 비활성.
            const pad = (n: number) => String(n).padStart(2, '0');
            const today = new Date();
            const minDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
            const maxD = new Date(today.getFullYear(), today.getMonth() + bookingWindowMonths, today.getDate());
            const maxDate = `${maxD.getFullYear()}-${pad(maxD.getMonth() + 1)}-${pad(maxD.getDate())}`;
            return (
              <DateTimePicker
                dateOnly
                value={`${selectedDate}T00:00`}
                onChange={(v) => setSelectedDate(v.slice(0, 10))}
                placeholder="날짜 선택"
                minDate={minDate}
                maxDate={maxDate}
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
            );
          })()}
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

        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: venueSummary ? 'var(--color-primary-deep)' : '#6B7280', letterSpacing: '0.02em' }}>
            📍 장소 {mode === 'edit' ? '(클릭하여 변경)' : venueSummary ? `(${selectedVenueIds.size})` : '(미선택)'}
          </span>
          {mode === 'edit' && editCurrentVenue ? (
            <button
              type="button"
              onClick={() => setVenueOpen(true)}
              style={{
                width: '100%',
                padding: isMobile ? '0.7rem 0.8rem' : '0.8rem 0.95rem',
                minHeight: 48,
                borderRadius: 12,
                border: '1.5px solid var(--color-primary)',
                background: '#fff',
                color: 'var(--color-ink)',
                fontWeight: 800,
                fontSize: isMobile ? '0.95rem' : '1rem',
                textAlign: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                cursor: 'pointer',
              }}
            >
              <span>{editCurrentVenue.floor} {editCurrentVenue.name}</span>
              <span aria-hidden style={{ fontSize: '0.8rem', color: 'var(--color-primary-deep)', opacity: 0.7 }}>▼</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
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
          )}
          <div style={{ minHeight: 24 }} />
        </div>
      </div>

      {hasBoth ? (
        <>
          <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '0.85rem', fontSize: '0.76rem', color: 'var(--color-ink-2)', flexWrap: 'wrap', alignItems: 'center', rowGap: '0.4rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: '#F7FEE7', border: '1px solid #D9F09E' }} /> 예약 가능
            </span>
            {mode === 'edit' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, background: 'rgba(167, 243, 208, 0.45)', border: '1.5px dashed #20CD8D' }} />
                <span style={{ color: '#EAB308', fontWeight: 800 }}>★</span> 기존 예약
              </span>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: '#A7F3D0', outline: '2px solid #20CD8D', outlineOffset: -1 }} />
              <span style={{ color: '#EAB308', fontWeight: 800 }}>★</span> 내 예약
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: '#DBEAFE', border: '1px solid #93C5FD' }} /> 타인 예약
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: '#4A4E3A' }} /> 예약불가
              {isAdmin && (
                <span style={{ marginLeft: '0.3rem', color: '#DC2626', fontWeight: 700 }}>※ 연락처는 시스템관리자에게만 보입니다</span>
              )}
            </span>
          </div>

          {/* 인라인 힌트 — 블럭 클릭→예약하기 버튼 흐름 안내. create 모드에서만 (편집은 별도 안내 띠). */}
          {mode === 'create' && (
            <div
              role="note"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 10,
                background: '#F9FAFB',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-ink-2)',
                fontSize: '0.8rem',
                fontWeight: 600,
                lineHeight: 1.45,
                wordBreak: 'keep-all',
              }}
            >
              <span aria-hidden style={{ flexShrink: 0 }}>💡</span>
              <span>원하는 시간 블럭을 선택한 뒤, 아래쪽에 나타나는 <strong style={{ color: 'var(--color-primary-deep)', fontWeight: 800 }}>✓ 예약하기</strong> 버튼을 누르면 완료돼요.</span>
            </div>
          )}

          <VenueGrid
            venues={selectedVenues}
            blocks={visibleBlocks}
            groups={groups}
            selectedDate={selectedDate}
            slotMin={slotMin}
            availableStart={availableStart}
            availableEnd={availableEnd}
            selectedSlots={selectedSlotsMap}
            ghostSlots={ghostSlotsMap}
            onSlotClick={handleSlotClick}
            onSlotPointerDown={handleSlotPointerDown}
            onSlotPointerEnter={handleSlotPointerEnter}
          />

          {selection ? (
            <div style={{ display: 'grid', gap: '0.4rem' }}>
              {/* 편집 모드 변경 요약 — 원본 vs 새 선택 */}
              {mode === 'edit' && originalEditSummary && (
                <div
                  role="note"
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 10,
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    color: '#78350F',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    lineHeight: 1.5,
                    wordBreak: 'keep-all',
                    display: 'grid',
                    gap: '0.15rem',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#92400E', fontWeight: 800, letterSpacing: '0.02em' }}>변경 요약</span>
                  <span>
                    {originalEditSummary.venueLabel} · {originalEditSummary.dateLabel} {originalEditSummary.range}
                    <span style={{ margin: '0 0.35rem', color: '#A16207' }}>→</span>
                    {selection.venue.floor} {selection.venue.name} · {selection.startLabel}~{selection.endLabel}
                  </span>
                </div>
              )}
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
                  >{mode === 'edit' ? '✓ 수정하기' : '✓ 예약하기'}</button>
                </div>
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

      {/* 장소 선택 모달 (create only) */}
      {venueOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setVenueOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div role="dialog" style={{
            width: '100%', maxWidth: 560, maxHeight: '90vh',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)' }}>📍 {mode === 'edit' ? '장소 변경' : '장소 선택'}</h3>
              <button type="button" onClick={() => setVenueOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40 }}>✕</button>
            </div>
            <div style={{ padding: '0.9rem 1rem', overflowY: 'auto', display: 'grid', gap: '0.7rem' }}>
              {mode === 'create' ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>{selectedVenueIds.size}/{venues.length} 선택됨</span>
                  <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                    <button type="button" onClick={selectAllVenues} style={{ padding: '0.4rem 0.7rem', minHeight: 36, borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>전체 선택</button>
                    <button type="button" onClick={clearVenues} style={{ padding: '0.4rem 0.7rem', minHeight: 36, borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>전체 해제</button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 600, lineHeight: 1.5 }}>
                  장소를 하나 선택하면 바로 적용됩니다. 장소를 바꾸면 시간은 다시 선택해야 해요.
                </p>
              )}

              {venuesByFloor.map(([floor, list]) => {
                const floorIds = list.map((v) => v.id);
                const floorAllOn = floorIds.length > 0 && floorIds.every((id) => selectedVenueIds.has(id));
                const floorSomeOn = floorIds.some((id) => selectedVenueIds.has(id));
                return (
                  <div key={floor} style={{ padding: '0.55rem 0.65rem', border: '1px solid var(--color-surface-border)', borderRadius: 10, background: '#FAFAF7', display: 'grid', gap: '0.45rem' }}>
                    {mode === 'create' ? (
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
                    ) : (
                      <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#3F6212' }}>{floor}</span>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {list.map((v) => {
                        const on = selectedVenueIds.has(v.id);
                        if (mode === 'edit') {
                          // 단일 선택: 클릭 시 해당 장소로 교체 + 모달 즉시 닫기
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => { setSelectedVenueIds(new Set([v.id])); setVenueOpen(false); }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.5rem 0.75rem', minHeight: 40,
                                borderRadius: 10,
                                background: on ? '#ECFCCB' : '#fff',
                                border: on ? '1.5px solid #65A30D' : '1px solid var(--color-surface-border)',
                                cursor: 'pointer',
                                fontSize: '0.86rem', whiteSpace: 'nowrap',
                              }}
                            >
                              <span style={{ color: 'var(--color-ink)', fontWeight: on ? 800 : 600 }}>{v.name}</span>
                              <span style={{ color: 'var(--color-ink-2)', fontFamily: 'monospace', fontSize: '0.72rem' }}>({v.code})</span>
                              {on && <span aria-hidden style={{ color: '#65A30D', fontWeight: 800, fontSize: '0.78rem' }}>✓</span>}
                            </button>
                          );
                        }
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
            {mode === 'create' && (
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
            )}
          </div>
        </div>
      )}

      {/* 예약전 정보확인 모달 */}
      {confirmOpen && selection && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !submitting) setConfirmOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <style>{`@keyframes kcisShake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }`}</style>
          <div role="dialog" aria-modal="true" style={{
            width: '100%', maxWidth: 520, maxHeight: '90vh',
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)' }}>📍 {mode === 'edit' ? t('page.reservation.editConfirmTitle') : t('page.reservation.confirmTitle')}</h3>
              <button type="button" onClick={() => !submitting && setConfirmOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: submitting ? 'not-allowed' : 'pointer', color: 'var(--color-ink-2)', minWidth: 40, minHeight: 40, opacity: submitting ? 0.5 : 1 }}>✕</button>
            </div>

            <div style={{ padding: '1rem', overflowY: 'auto', display: 'grid', gap: '0.85rem' }}>
              <div style={{ padding: '0.75rem 0.9rem', borderRadius: 12, background: '#FFF7ED', border: '1px solid #FED7AA', display: 'grid', gap: '0.55rem' }}>
                <style>{`.kcis-resv-input::placeholder { color: #D1D5DB; font-style: italic; font-weight: 400; opacity: 1; }`}</style>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#9A3412', letterSpacing: '0.02em' }}>👤 {t('page.reservation.reserverInfo')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: '0.4rem 0.5rem', fontSize: '0.92rem', alignItems: 'center' }}>
                  <span style={{ color: '#9A3412', fontWeight: 800 }}>{t('page.reservation.name')}</span>
                  <input
                    type="text"
                    className="kcis-resv-input"
                    value={stagedName}
                    onChange={(e) => setStagedName(e.target.value)}
                    placeholder="실명을 입력하세요"
                    style={{ padding: '0.5rem 0.7rem', minHeight: 38, borderRadius: 8, border: '1px solid #FED7AA', background: '#fff', fontSize: '0.9rem', color: 'var(--color-ink)', fontWeight: 700 }}
                  />
                  <span style={{ color: '#9A3412', fontWeight: 800 }}>{t('page.reservation.contact')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--color-ink-2)', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>+65</span>
                    <input
                      type="tel"
                      className="kcis-resv-input"
                      value={(() => { const s = (stagedContact || '').trim(); const m = s.match(/^\+\d{1,3}[\s-]*(.+)$/); return m ? m[1].trim() : s; })()}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                        const formatted = digits.length <= 4 ? digits : `${digits.slice(0, 4)}-${digits.slice(4)}`;
                        setStagedContact(formatted ? `+65 ${formatted}` : '');
                      }}
                      placeholder="예) 1234-5678"
                      inputMode="numeric"
                      maxLength={9}
                      style={{ flex: 1, minWidth: 0, padding: '0.5rem 0.7rem', minHeight: 38, borderRadius: 8, border: '1px solid #FED7AA', background: '#fff', fontSize: '0.9rem', color: 'var(--color-ink)', fontWeight: 700, fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
                {stagedInfoError && (
                  <p style={{ margin: 0, padding: '0.5rem 0.7rem', borderRadius: 8, background: '#FEE2E2', color: '#B91C1C', fontSize: '0.84rem', fontWeight: 700 }}>⚠ {stagedInfoError}</p>
                )}
              </div>

              <div style={{ padding: '0.75rem 0.9rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E', display: 'grid', gap: '0.4rem' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#3F6212', letterSpacing: '0.02em' }}>📅 {t('page.reservation.datePlace')}</div>
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

              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-ink)' }}>
                  {t('page.reservation.descriptionLabel')} <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="예) 청년부 임원모임"
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

              {mode === 'create' && (
                <div style={{
                  padding: '0.85rem 0.95rem', borderRadius: 12,
                  background: '#FEF3C7',
                  border: shakeConfirm ? '2px solid #DC2626' : '1px solid #FBBF24',
                  display: 'grid', gap: '0.5rem',
                  animation: shakeConfirm ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
                  transition: 'border-color 0.2s ease',
                }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#92400E', letterSpacing: '0.02em' }}>⚠️ 예약 전 확인해 주세요!</div>
                  {[
                    { checked: cMember, setter: setCMember, label: '장소 예약 서비스는 정확한 성함과 연락처가 등록된 교인에 한해 제공됩니다.' },
                    { checked: cCancel, setter: setCCancel, label: '연락처 미기재 또는 허위 정보 입력 시 예약이 임의 취소될 수 있으며, 이후 서비스 이용에 제한이 있을 수 있습니다.' },
                  ].map((item, i) => (
                    <label key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.7rem',
                      padding: '0.35rem 0',
                      fontSize: '0.9rem',
                      color: '#78350F', fontWeight: 700, lineHeight: 1.6, cursor: 'pointer',
                    }}>
                      <input type="checkbox" checked={item.checked} onChange={(e) => item.setter(e.target.checked)} style={{ marginTop: '0.1rem', accentColor: '#D97706', flexShrink: 0, width: 24, height: 24 }} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {initialMissing && (
                <div style={{
                  padding: '0.85rem 0.95rem', borderRadius: 12,
                  background: '#EFF6FF',
                  border: shakeConfirm && !cInfoCollect ? '2px solid #DC2626' : '1px solid #BFDBFE',
                  display: 'grid', gap: '0.55rem',
                  animation: shakeConfirm && !cInfoCollect ? 'kcisShake 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both' : undefined,
                  transition: 'border-color 0.2s ease',
                }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1E3A8A', letterSpacing: '0.02em' }}>
                    🔒 [필수] 장소 예약 및 이용을 위한 추가 정보 수집 동의
                  </div>
                  <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.82rem', color: '#1E40AF', lineHeight: 1.6 }}>
                    <div><strong style={{ color: '#1E3A8A' }}>수집 항목:</strong> 성명, 연락처(휴대전화 번호)</div>
                    <div><strong style={{ color: '#1E3A8A' }}>수집 목적:</strong> 장소 예약 확인, 이용 안내 및 긴급 공지, 허위 예약 방지</div>
                    <div><strong style={{ color: '#1E3A8A' }}>보유 및 이용 기간:</strong> 회원 탈퇴 시까지 (단, 관련 법령에 의거 보존 필요 시 해당 기간까지)</div>
                    <div><strong style={{ color: '#B91C1C' }}>주의 사항:</strong> 입력하신 정보가 허위일 경우, 예약이 사전 고지 없이 임의 취소될 수 있습니다.</div>
                  </div>
                  <label style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.7rem',
                    padding: '0.55rem 0.7rem', marginTop: '0.15rem',
                    background: '#fff', borderRadius: 8, border: '1px solid #BFDBFE',
                    fontSize: '0.9rem', color: '#1E3A8A', fontWeight: 700, lineHeight: 1.5, cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={cInfoCollect} onChange={(e) => setCInfoCollect(e.target.checked)} style={{ marginTop: '0.1rem', accentColor: '#1D4ED8', flexShrink: 0, width: 22, height: 22 }} />
                    <span>위 내용을 확인하였으며 동의합니다.</span>
                  </label>
                </div>
              )}

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
              >{submitting ? t('page.reservation.submitting') : mode === 'edit' ? t('page.reservation.submitEdit') : t('page.reservation.submit')}</button>
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

      {/* edit 모드 닫기 버튼 (선택적) */}
      {successModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div role="dialog" aria-modal="true" style={{
            width: '100%', maxWidth: 420,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '1rem 1.25rem 0.85rem', background: '#ECFDF5', borderBottom: '1px solid #86EFAC', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span aria-hidden style={{ fontSize: '1.5rem', lineHeight: 1 }}>✅</span>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#065F46' }}>예약이 등록되었습니다</h3>
            </div>
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '0.5rem' }}>
              <div style={{ padding: '0.7rem 0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.3rem', fontSize: '0.9rem' }}>
                <div style={{ color: 'var(--color-ink)', fontWeight: 800 }}>{successModal.date}</div>
                <div style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{successModal.start}~{successModal.end}</div>
                <div style={{ color: 'var(--color-ink-2)', fontWeight: 600 }}>📍 {successModal.venue}</div>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-ink-2)', lineHeight: 1.5 }}>
                확인을 누르시면 <strong style={{ color: 'var(--color-primary-deep)' }}>대시보드</strong>로 이동합니다.
              </p>
            </div>
            <div style={{ padding: '0.85rem 1.25rem 1.1rem', borderTop: '1px solid var(--color-surface-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setSuccessModal(null); onSubmitted?.(); }}
                style={{
                  padding: '0.75rem 1.6rem',
                  minHeight: 48,
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(32,205,141,0.25)',
                }}
              >확인</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'edit' && onCancel && (
        <div style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ width: '100%', padding: '0.55rem 1rem', minHeight: 40, borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
          >닫기</button>
        </div>
      )}
    </>
  );
};

export default ReservationSlotPicker;
