import React, { useRef, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

export type Venue = {
  id: string;
  floor: string;
  name: string;
  code: string;
  availableStart: string;
  availableEnd: string;
  availableDays: number[];
};

export type Block = {
  /** 현재 로그인한 사용자 본인의 예약 여부 — reservation kind 전용. VenueGrid 에서 강조 표시. */
  mine?: boolean;
  // (아래 속성들 — 기존)
  id: string;
  venueId: string;
  startAt: string;
  endAt: string | null;
  reason?: string;
  kind?: 'event' | 'reservation' | 'block';  // event=교회행사(관리자), reservation=사용자예약, block=관리자 차단(기본)
  reserverName?: string;   // reservation kind 전용 — 예약자 실명
  reserverContact?: string;  // reservation kind 전용 — 연락처
};

export type BlockGroup = {
  id: string;
  venueId: string;
  slots?: Array<{ dow: number; startMin: number }>;
  days?: number[];
  startMin?: number;
  endMin?: number;
  endDate: string | null;
  reason?: string;
  createdAt?: string;
};

const expandGroupToSlots = (g: BlockGroup): Array<{ dow: number; startMin: number }> => {
  if (g.slots && g.slots.length > 0) return g.slots;
  const out: Array<{ dow: number; startMin: number }> = [];
  const SLOT_MIN_LOCAL = 30;
  if (g.days && typeof g.startMin === 'number' && typeof g.endMin === 'number') {
    for (const dow of g.days) {
      for (let m = g.startMin; m < g.endMin; m += SLOT_MIN_LOCAL) out.push({ dow, startMin: m });
    }
  }
  return out;
};

/**
 * 그룹 정의로부터 특정 날짜의 블럭된 슬롯 집합을 계산합니다 (on-demand).
 * 반환: Map<venueId, Set<startMin>>
 */
export const computeBlockedSlotsForDate = (
  groups: BlockGroup[],
  selectedDate: string,
): Map<string, Set<number>> => {
  const result = new Map<string, Set<number>>();
  const [y, m, d] = selectedDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setHours(0, 0, 0, 0);
  const ts = dateObj.getTime();
  const dow = dateObj.getDay();
  for (const g of groups) {
    if (g.endDate) {
      const endTs = new Date(`${g.endDate}T23:59:59`).getTime();
      if (ts > endTs) continue;
    }
    const slots = expandGroupToSlots(g);
    for (const s of slots) {
      if (s.dow !== dow) continue;
      if (!result.has(g.venueId)) result.set(g.venueId, new Set());
      result.get(g.venueId)!.add(s.startMin);
    }
  }
  return result;
};

export const SLOT_MIN = 30;

export const toHHMM = (minFromMidnight: number) => {
  const h = Math.floor(minFromMidnight / 60);
  const m = minFromMidnight % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const isBlocked = (blocks: Block[], venueId: string, startAt: Date, endAt: Date) => {
  return blocks.some((b) => {
    if (b.venueId !== venueId) return false;
    const bStart = new Date(b.startAt).getTime();
    const bEnd = b.endAt ? new Date(b.endAt).getTime() : Number.POSITIVE_INFINITY;
    return bStart < endAt.getTime() && bEnd > startAt.getTime();
  });
};

type Props = {
  venues: Venue[];
  blocks?: Block[];
  groups?: BlockGroup[];
  selectedDate: string;
  slotMin?: number;
  availableStart?: string;
  availableEnd?: string;
  selectedSlots?: Map<string, Set<number>>;
  alternateSlots?: Map<string, Set<number>>;  // picker에서 함께 선택된 "대체" 장소 — 비활성 표시, 클릭 시 swap
  /**
   * 편집 모드에서 "원래 예약" 을 ghost 로 표시. blocked 취급하지 않고(클릭 가능),
   * 연민트 배경 + 가운데 ★ 표시로 현재 예약 위치를 지속적으로 알림. 사용자가 새 시간을 선택해도 사라지지 않는다.
   */
  ghostSlots?: Map<string, Set<number>>;
  onSlotClick?: (venue: Venue, slotMin: number, blocked: boolean) => void;
  onSlotPointerDown?: (venue: Venue, slotMin: number, blocked: boolean) => void;
  onSlotPointerEnter?: (venue: Venue, slotMin: number, blocked: boolean) => void;
  renderRowExtra?: (venue: Venue) => React.ReactNode;
  showActionColumn?: boolean;
};

type CellInfo = {
  venue: Venue;
  startMin: number;
  endMin: number;
  kind: 'reservation' | 'event';
  name: string;
  contact: string;
  title: string;
  mine: boolean;
};

const VenueGrid = ({ venues: venuesProp, blocks = [], groups = [], selectedDate, slotMin = SLOT_MIN, availableStart = '06:00', availableEnd = '22:00', selectedSlots, alternateSlots, ghostSlots, onSlotClick, onSlotPointerDown, onSlotPointerEnter, renderRowExtra, showActionColumn = false }: Props) => {
  const isMobile = useIsMobile();
  const blockedByVenue = computeBlockedSlotsForDate(groups, selectedDate);
  // 예약/교회일정 셀 클릭 시 예약자 정보 팝오버 표시 (큰 글씨)
  const [cellInfo, setCellInfo] = useState<CellInfo | null>(null);

  // 그룹 블럭의 reason까지 함께 (venueId → slotMin → reason)
  const groupReasonByVenue = (() => {
    const map = new Map<string, Map<number, string>>();
    const [y, mo, dd] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, mo - 1, dd);
    const ts = dateObj.getTime();
    const dow = dateObj.getDay();
    for (const g of groups) {
      if (g.endDate) {
        const endTs = new Date(`${g.endDate}T23:59:59`).getTime();
        if (ts > endTs) continue;
      }
      const slots: Array<{ dow: number; startMin: number }> = [];
      // expandGroupToSlots is internal; replicate inline
      for (const sg of g.slots) {
        const targets = sg.dow === -1 ? [0,1,2,3,4,5,6] : [sg.dow];
        for (const dw of targets) {
          for (let m = sg.startMin; m < sg.endMin; m += SLOT_MIN) slots.push({ dow: dw, startMin: m });
        }
      }
      for (const s of slots) {
        if (s.dow !== dow) continue;
        if (!map.has(g.venueId)) map.set(g.venueId, new Map());
        map.get(g.venueId)!.set(s.startMin, g.reason || '예약불가');
      }
    }
    return map;
  })();
  const venues = [...venuesProp].sort((a, b) => {
    const fa = Number((a.floor.match(/(\d+)/) || [])[1] || 0);
    const fb = Number((b.floor.match(/(\d+)/) || [])[1] || 0);
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name, 'ko');
  });
  const minStart = toMin(availableStart);
  const maxEnd = toMin(availableEnd);
  const slotMins: number[] = [];
  for (let m = minStart; m < maxEnd; m += slotMin) slotMins.push(m);

  const [y, mo, d] = selectedDate.split('-').map(Number);
  const selectedDateObj = new Date(y, mo - 1, d);
  const selectedDow = selectedDateObj.getDay();

  // 과거 시간 차단:
  //  - selectedDate 가 오늘보다 이전 날짜 → 전 슬롯 불가
  //  - selectedDate 가 오늘 → 현재 분 이전 슬롯 불가
  const nowForGrid = new Date();
  const todayStart = new Date(nowForGrid.getFullYear(), nowForGrid.getMonth(), nowForGrid.getDate()).getTime();
  const selectedStart = new Date(y, mo - 1, d).getTime();
  const isPastDate = selectedStart < todayStart;
  const isSelectedToday = selectedStart === todayStart;
  const pastCutoffMin = isPastDate ? 24 * 60 /* 전부 과거 */
    : isSelectedToday ? (nowForGrid.getHours() * 60 + nowForGrid.getMinutes())
    : -1;

  // 가로 = 장소 / 세로 = 시간
  const availableStartMin = toMin(availableStart);
  const availableEndMin = toMin(availableEnd);

  const TIME_HOUR_W = isMobile ? 28 : 34;
  const TIME_MIN_W = isMobile ? 26 : 32;
  // 장소 헤더(층+이름+코드)가 겹치지 않는 최소 폭 — 너무 작으면 텍스트가 이웃 칸과 겹쳐 보임
  const VENUE_MIN_W = isMobile ? 72 : 96;
  // 모바일에서 그리드 행 높이를 터치 타겟 기준에 맞춰 상향
  const SLOT_ROW_H = isMobile ? 28 : 20;
  // 장소 수가 많으면 화면을 넘어서도 테이블을 넓혀 outer div 의 overflowX 로 좌우 스크롤되게 한다
  const tableMinWidth = TIME_HOUR_W + TIME_MIN_W + venues.length * VENUE_MIN_W;
  // 그리드 최대 높이 — iPhone SE(568px) 기준으로 SubHeader(~56px)·섹션 패딩 고려해 모바일은 60vh
  const gridMaxHeight = isMobile ? '60vh' : '75vh';
  // 상·하 이중 가로 스크롤: 사용자가 그리드를 세로로 스크롤했을 때도 바로 손 닿는 곳에 가로 스크롤바
  const topScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const onTopScroll = () => {
    if (syncing.current) { syncing.current = false; return; }
    if (mainScrollRef.current && topScrollRef.current) {
      syncing.current = true;
      mainScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };
  const onMainScroll = () => {
    if (syncing.current) { syncing.current = false; return; }
    if (topScrollRef.current && mainScrollRef.current) {
      syncing.current = true;
      topScrollRef.current.scrollLeft = mainScrollRef.current.scrollLeft;
    }
  };
  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {/* 상단 미러 가로 스크롤바 — 실제 테이블 폭과 동일해 양쪽에서 조작 가능 */}
      <div
        ref={topScrollRef}
        onScroll={onTopScroll}
        aria-hidden="true"
        style={{
          overflowX: 'auto', overflowY: 'hidden',
          height: 14,
          border: '1px solid var(--color-surface-border)',
          borderBottom: 'none',
          borderTopLeftRadius: 10, borderTopRightRadius: 10,
          background: '#FAFAF7',
        }}
      >
        <div style={{ width: tableMinWidth, height: 1 }} />
      </div>
    <div ref={mainScrollRef} onScroll={onMainScroll} className="responsive-x-scroll" style={{ overflowX: 'auto', overflowY: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--color-surface-border)', borderTop: '1px solid var(--color-surface-border)', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, background: '#fff', maxHeight: gridMaxHeight }}>
      <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'collapse', fontSize: isMobile ? '0.68rem' : '0.72rem', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: TIME_HOUR_W }} />
          <col style={{ width: TIME_MIN_W }} />
          {venues.map((v) => <col key={v.id} style={{ minWidth: VENUE_MIN_W }} />)}
        </colgroup>
        <thead style={{ position: 'sticky', top: 0, zIndex: 3, background: '#ECFCCB' }}>
          <tr style={{ background: '#ECFCCB' }}>
            <th colSpan={2} style={{ padding: '0.25rem 0.4rem', position: 'sticky', left: 0, background: '#ECFCCB', textAlign: 'center', borderRight: '1px solid #D9F09E', zIndex: 4, fontSize: '0.72rem', fontWeight: 800 }}>시간</th>
            {venues.map((v) => (
              <th key={v.id} style={{ padding: '0.35rem 0.25rem', borderRight: '1px solid #F1F5F9', color: '#4D7C0F', fontWeight: 700, minWidth: VENUE_MIN_W, verticalAlign: 'middle', lineHeight: 1.15, background: '#ECFCCB' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem', padding: '0 0.1rem', overflow: 'hidden' }}>
                  <span style={{ fontSize: '0.6rem', color: '#334155', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{v.floor}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{v.name}</span>
                  <span style={{ fontSize: '0.56rem', color: 'var(--color-ink-2)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{v.code}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            // 각 venue별 슬롯 정보 사전계산: 연속된 같은 (reason, kind, 예약자)의 블럭을 rowSpan으로 묶음
            type SlotInfo = { blocked: boolean; reason: string; kind: 'event' | 'reservation' | 'block'; reserverName?: string; reserverContact?: string; mine?: boolean; isStart: boolean; span: number };
            const venueSlotInfos = new Map<string, SlotInfo[]>();
            for (const v of venues) {
              const infos: SlotInfo[] = slotMins.map((mm) => {
                const ss = new Date(y, mo - 1, d, Math.floor(mm / 60), mm % 60);
                const se = new Date(ss.getTime() + slotMin * 60 * 1000);
                const groupSlot = blockedByVenue.get(v.id)?.has(mm) || (slotMin === 60 ? blockedByVenue.get(v.id)?.has(mm + 30) : false) || false;
                const groupReason = groupReasonByVenue.get(v.id)?.get(mm) || (slotMin === 60 ? groupReasonByVenue.get(v.id)?.get(mm + 30) : undefined);
                let blocked = groupSlot;
                let reason = groupReason || '';
                let kind: 'event' | 'reservation' | 'block' = 'block';
                let reserverName: string | undefined;
                let reserverContact: string | undefined;
                let mine: boolean | undefined;
                for (const b of blocks) {
                  if (b.venueId !== v.id) continue;
                  const bs = new Date(b.startAt).getTime();
                  const be = b.endAt ? new Date(b.endAt).getTime() : Number.POSITIVE_INFINITY;
                  if (bs < se.getTime() && be > ss.getTime()) {
                    blocked = true;
                    if (b.reason) reason = b.reason;
                    if (b.kind) kind = b.kind;
                    reserverName = b.reserverName;
                    reserverContact = b.reserverContact;
                    mine = b.mine;
                    break;
                  }
                }
                return { blocked, reason, kind, reserverName, reserverContact, mine, isStart: false, span: 1 };
              });
              for (let i = 0; i < infos.length; i++) {
                if (!infos[i].blocked) continue;
                const prev = infos[i - 1];
                const samePrev = i > 0 && prev.blocked && prev.reason === infos[i].reason && prev.kind === infos[i].kind && prev.reserverName === infos[i].reserverName && prev.mine === infos[i].mine;
                if (!samePrev) {
                  infos[i].isStart = true;
                  let span = 1;
                  while (i + span < infos.length && infos[i + span].blocked && infos[i + span].reason === infos[i].reason && infos[i + span].kind === infos[i].kind && infos[i + span].reserverName === infos[i].reserverName && infos[i + span].mine === infos[i].mine) span++;
                  infos[i].span = span;
                }
              }
              venueSlotInfos.set(v.id, infos);
            }

            // 선택된 슬롯 분(min) 집합 — 좌측 시간 칼럼 강조용
            const selectedRowMins = new Set<number>();
            if (selectedSlots) {
              for (const set of selectedSlots.values()) for (const mm of set) selectedRowMins.add(mm);
            }
            return slotMins.map((m, rowIdx) => {
            const slotStart = new Date(y, mo - 1, d, Math.floor(m / 60), m % 60);
            const slotEnd = new Date(slotStart.getTime() + slotMin * 60 * 1000);
            const isHourStart = m % 60 === 0;
            const hour = Math.floor(m / 60);
            const minPart = m % 60;
            // 30분 슬롯이고 :00(isHourStart)일 때만 좌측 hour 셀을 rowSpan=2로 그림
            const showHourCell = slotMin === 60 || isHourStart;
            const hourRowSpan = slotMin === 60 ? 1 : 2;
            // 이 행(분 셀)이 선택 범위에 포함되는지
            const rowSelected = selectedRowMins.has(m);
            // hour 셀은 rowSpan 만큼의 하위 행 중 하나라도 선택되면 강조
            const hourSelected = slotMin === 60 ? rowSelected : (selectedRowMins.has(m) || selectedRowMins.has(m + 30));
            const timeColBg = '#FFFFFF';
            const timeColSelectedBg = '#20CD8D';
            return (
              <tr key={m} style={{ borderTop: isHourStart ? '1.5px solid #D9F09E' : '1px solid #F4F4F0', height: SLOT_ROW_H }}>
                {showHourCell && (
                  <td
                    rowSpan={hourRowSpan}
                    style={{
                      padding: '0 0.25rem',
                      position: 'sticky',
                      left: 0,
                      background: hourSelected ? timeColSelectedBg : timeColBg,
                      borderRight: '1px solid #E5E7EB',
                      color: hourSelected ? '#FFFFFF' : '#0F172A',
                      fontWeight: hourSelected ? 800 : 400,
                      fontSize: isMobile ? '0.82rem' : '1.05rem',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      zIndex: 1,
                      lineHeight: 1,
                      transition: 'background 0.12s ease, color 0.12s ease',
                    }}
                  >{hour}</td>
                )}{/* hour 셀 끝 */}
                <td style={{
                  padding: '0 0.3rem',
                  position: 'sticky',
                  left: TIME_HOUR_W,
                  background: rowSelected ? timeColSelectedBg : timeColBg,
                  borderRight: '1.5px solid #D9F09E',
                  color: rowSelected ? '#FFFFFF' : '#4D7C0F',
                  fontWeight: rowSelected ? 800 : 400,
                  fontSize: '0.68rem',
                  whiteSpace: 'nowrap',
                  textAlign: 'right',
                  zIndex: 1,
                  opacity: rowSelected ? 1 : 0.85,
                  transition: 'background 0.12s ease, color 0.12s ease',
                }}>:{String(minPart).padStart(2, '0')}</td>
                {venues.map((v) => {
                  const info = venueSlotInfos.get(v.id)?.[rowIdx];
                  // 블럭 연속 영역의 첫 행 외에는 위 행이 rowSpan으로 덮으므로 td 자체를 생략
                  if (info && info.blocked && !info.isStart) return null;
                  const isAvailableDay = v.availableDays.includes(selectedDow);
                  const isPast = pastCutoffMin >= 0 && m < pastCutoffMin;
                  const inAvailable = isAvailableDay && m >= availableStartMin && m < availableEndMin && !isPast;
                  const blocked = info?.blocked || false;
                  const reason = info?.reason || '';
                  const span = info?.span || 1;
                  const kind = info?.kind || 'block';
                  const reserverName = info?.reserverName;
                  const reserverContact = info?.reserverContact;
                  const mine = info?.mine;
                  const isSelected = !!selectedSlots?.get(v.id)?.has(m);
                  const isAlternate = !isSelected && !blocked && inAvailable && !!alternateSlots?.get(v.id)?.has(m);
                  // 편집 모드의 "원래 예약 ghost" — blocked 도 아니고 선택된 것도 아닌 상태에서만 표시
                  const isGhost = !isSelected && !blocked && inAvailable && !!ghostSlots?.get(v.id)?.has(m);
                  // 사용자 선택이 기존 예약/블럭과 겹치면 "예약불가" 경고 상태
                  const isConflict = isSelected && blocked;
                  // 색상: 충돌=주황경고, 선택=민트, 대체=반투명민트+점선, 불가시간=연회색,
                  //       교회일정/예약됨/예약불가 = 올리브-그레이 3단계 (배경 #F7FEE7·라임 팔레트와 조화).
                  //       내 예약 = 연민트(#A7F3D0) + 진녹 글씨(#064E3B) — 오렌지 대신 부드러운 강조.
                  const kindBg = kind === 'event'
                    ? '#4A4E3A'
                    : kind === 'reservation'
                      ? (mine ? '#A7F3D0' : '#BFDBFE')
                      : '#6B6F5C';
                  // 타인 예약: 소프트 블루 배경에 딥 블루 글자 (접근성 대비 확보).
                  // 내 예약: 연라임 + 딥그린. 그 외(교회일정·블럭): 어두운 배경 + 흰 글자.
                  const kindFg = kind === 'reservation'
                    ? (mine ? '#064E3B' : '#1E40AF')
                    : '#FFFFFF';
                  // 과거 시간 배경 — 빈 슬롯은 대각 스트라이프, 블럭은 kindBg 유지 후 opacity 로 흐림 처리
                  const pastEmptyBg = 'repeating-linear-gradient(135deg, #F3F4F6 0 6px, #F9FAFB 6px 12px)';
                  // 과거 + 내 예약: 연민트 위에 얇은 대각 스트라이프 오버레이로 '지난 내 예약' 시각화
                  const pastMineBg = 'repeating-linear-gradient(135deg, rgba(6, 78, 59, 0.1) 0 3px, transparent 3px 9px), #A7F3D0';
                  const isPastMine = isPast && blocked && !!mine;
                  // 우선순위: conflict > selected > alternate > ghost > blocked(과거+내꺼면 스트라이프 오버레이, 그외 kindBg) > 과거 빈 슬롯(스트라이프) > 불가 시간 > 기본
                  const bg = isConflict
                    ? '#F59E0B'
                    : isSelected
                      ? '#20CD8D'
                      : isAlternate
                        ? 'rgba(32, 205, 141, 0.18)'
                        : isGhost
                          ? 'rgba(167, 243, 208, 0.45)'
                          : blocked
                            ? (isPastMine ? pastMineBg : kindBg)
                            : isPast
                              ? pastEmptyBg
                              : !inAvailable
                                ? '#E5E7EB'
                                : '#F7FEE7';
                  const color = isConflict
                    ? '#FFFFFF'
                    : isSelected
                      ? '#fff'
                      : isAlternate
                        ? '#3F6212'
                        : isGhost
                          ? '#064E3B'
                          : blocked
                            ? kindFg
                            : !inAvailable
                              ? '#9CA3AF'
                              : '#4D7C0F';
                  // 과거 블럭 흐림 처리 — 내 예약은 선명도 유지(색상·테두리 그대로), 타인/이벤트/불가만 흐리게.
                  const pastFadeBlocked = isPast && blocked && !mine;
                  const clickable = !!onSlotClick && inAvailable;
                  const kindLabel = kind === 'event' ? '교회일정' : kind === 'reservation' ? '예약됨' : '예약불가';
                  const titleParts = [`${v.floor} ${v.name} ${toHHMM(m)}`];
                  if (!inAvailable) titleParts.push(isPast ? '지난 시간 — 예약 불가' : '예약 불가 시간대');
                  else if (blocked) {
                    titleParts.push(`${kindLabel}${mine ? ' (내 예약)' : ''}: ${reason}`);
                    if (kind === 'reservation' && reserverName) titleParts.push(`예약자: ${reserverName}`);
                    if (kind === 'reservation' && reserverContact) titleParts.push(`연락처: ${reserverContact}`);
                  } else if (isSelected) titleParts.push('예약 시간 선택됨');
                  else if (isAlternate) titleParts.push('후보 (클릭하여 이 장소로 전환)');
                  else if (isGhost) titleParts.push('기존 예약 — 새 시간을 선택할 수 있어요');
                  else titleParts.push('예약 가능 — 클릭하거나, 시작 셀에서 끝 셀까지 드래그하면 한 번에 선택됩니다');
                  // 셀 내부: reservation kind이면 가능한 한 항상 예약자 실명까지 표시.
                  // span ≥ 2 → 스택 (reason + reserverName + contact 각 줄)
                  // span = 1 → 한 줄 압축 (`reason · reserverName`)
                  const hasReserverInfo = !!(reserverName || reserverContact);
                  const showStacked = blocked && kind === 'reservation' && span >= 2 && hasReserverInfo;
                  const compactReserver = blocked && kind === 'reservation' && span === 1 && !!reserverName;
                  // 블럭된 reservation/event 셀 → 클릭 시 정보 팝오버 (과거여도 클릭 가능)
                  const infoClickable = blocked && (kind === 'reservation' || kind === 'event') && (hasReserverInfo || !!reason || kind === 'event');
                  const anyClickable = clickable || infoClickable;
                  return (
                    <td key={v.id} rowSpan={blocked ? span : 1} style={{ padding: 0, borderRight: '1px solid #F4F4F0', minWidth: VENUE_MIN_W, height: blocked ? span * SLOT_ROW_H : SLOT_ROW_H, verticalAlign: 'top' }}>
                      <button
                        type="button"
                        disabled={!anyClickable}
                        onClick={() => {
                          if (infoClickable) {
                            setCellInfo({
                              venue: v,
                              startMin: m,
                              endMin: m + span * slotMin,
                              kind: kind === 'event' ? 'event' : 'reservation',
                              name: reserverName || '',
                              contact: reserverContact || '',
                              title: reason || '',
                              mine: !!mine,
                            });
                            return;
                          }
                          if (!clickable) return;
                          onSlotClick && onSlotClick(v, m, blocked);
                        }}
                        onPointerDown={onSlotPointerDown ? (e) => {
                          // 모바일(터치)은 드래그 선택을 건너뛰고 페이지 스크롤을 우선 — onClick 만으로 토글
                          if (e.pointerType === 'touch') return;
                          if (!inAvailable) return;  // 과거/불가 시간 슬롯은 드래그 시작 금지
                          try { (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId); } catch {}
                          onSlotPointerDown(v, m, blocked);
                        } : undefined}
                        onPointerEnter={onSlotPointerEnter ? (e) => {
                          if (e.pointerType === 'touch') return;
                          if (!inAvailable) return;  // 과거/불가 시간 슬롯으로 드래그 확장 금지
                          onSlotPointerEnter(v, m, blocked);
                        } : undefined}
                        title={titleParts.join(' | ')}
                        style={{ width: '100%', height: '100%', minHeight: blocked ? span * SLOT_ROW_H : SLOT_ROW_H, display: 'block', border: isAlternate ? '1.5px dashed #20CD8D' : isGhost ? '1.5px dashed #20CD8D' : mine ? '2px solid #20CD8D' : (blocked && kind === 'reservation') ? '0.5px solid #1E40AF' : 'none', outline: mine ? '2px solid #20CD8D' : undefined, outlineOffset: mine ? '-2px' : undefined, background: bg, color, cursor: anyClickable ? 'pointer' : 'not-allowed', fontSize: isMobile ? '0.62rem' : '0.6rem', fontWeight: mine || isGhost ? 800 : 700, lineHeight: 1.15, padding: blocked ? '2px 4px' : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'keep-all', verticalAlign: 'middle', boxSizing: 'border-box', touchAction: 'manipulation', userSelect: 'none', boxShadow: mine ? 'inset 0 0 0 1px rgba(255,255,255,0.7)' : undefined, pointerEvents: anyClickable ? undefined : 'none', opacity: pastFadeBlocked ? 0.55 : 1, filter: pastFadeBlocked ? 'saturate(0.55)' : undefined }}
                      >
                        {isConflict ? '예약불가' : isSelected ? '예약가능' : isAlternate ? '○' : isGhost ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.58rem' }}>
                            <span style={{ color: '#EAB308' }}>★</span>
                            <span style={{ color: '#064E3B', fontWeight: 700 }}>기존 예약</span>
                          </span>
                        ) : (blocked ? (
                          showStacked ? (
                            <span style={{ display: 'grid', gap: 1, lineHeight: 1.1 }}>
                              {mine && (
                                <span style={{ fontWeight: 800, fontSize: '0.56rem', color: '#064E3B', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <span style={{ color: '#EAB308', fontSize: '0.7rem', lineHeight: 1, textShadow: '0 0 2px rgba(234,179,8,0.5)' }}>★</span>
                                  내 예약
                                </span>
                              )}
                              <span style={{ fontWeight: 800 }}>{reason || kindLabel}</span>
                              {reserverName && <span style={{ fontWeight: 700, opacity: mine ? 1 : 0.95 }}>{reserverName}</span>}
                              {reserverContact && <span style={{ fontWeight: 600, opacity: mine ? 1 : 0.9, fontSize: '0.55rem' }}>{reserverContact}</span>}
                            </span>
                          ) : compactReserver ? (
                            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'baseline', maxWidth: '100%' }}>
                              {mine && <span style={{ fontWeight: 800, fontSize: '0.56rem' }}>⭐</span>}
                              <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reason || kindLabel}</span>
                              <span style={{ fontWeight: 600, opacity: 0.92, fontSize: '0.56rem', whiteSpace: 'nowrap' }}>· {reserverName}</span>
                            </span>
                          ) : (mine ? `⭐ ${reason || kindLabel}` : (reason || kindLabel))
                        ) : '')}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          });
          })()}
          {venues.length === 0 && (
            <tr><td colSpan={1} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-ink-2)' }}>등록된 장소가 없습니다.</td></tr>
          )}
        </tbody>
      </table>
    </div>
    {cellInfo && (
      <div
        role="dialog"
        aria-label={cellInfo.kind === 'event' ? '교회일정 정보' : '예약 정보'}
        onClick={(e) => { if (e.target === e.currentTarget) setCellInfo(null); }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      >
        <div style={{ width: '100%', maxWidth: 400, background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '1.2rem 1.25rem', display: 'grid', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: cellInfo.kind === 'event' ? '#4A4E3A' : 'var(--color-primary-deep)', letterSpacing: '0.02em' }}>
              {cellInfo.kind === 'event' ? '📌 교회일정' : cellInfo.mine ? '📍 내 예약' : '📍 예약'}
            </span>
            <button type="button" onClick={() => setCellInfo(null)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-ink-2)', minWidth: 36, minHeight: 36, borderRadius: 8 }}>✕</button>
          </div>
          <div style={{ fontSize: '0.86rem', color: 'var(--color-ink-2)' }}>
            {cellInfo.venue.floor} {cellInfo.venue.name} · {toHHMM(cellInfo.startMin)}~{toHHMM(cellInfo.endMin)}
          </div>
          {cellInfo.kind === 'reservation' ? (
            <>
              {cellInfo.name ? (
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-ink)', letterSpacing: '-0.01em', wordBreak: 'keep-all', lineHeight: 1.3 }}>
                  {cellInfo.name}
                </div>
              ) : (
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>예약자 이름 비공개</div>
              )}
              {cellInfo.contact ? (
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-ink)', fontFamily: 'var(--font-mono, monospace)' }}>
                  📞 {cellInfo.contact}
                </div>
              ) : (
                <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>연락처는 관리자에게만 표시됩니다</div>
              )}
              {cellInfo.title && (
                <div style={{ fontSize: '0.88rem', color: 'var(--color-ink-2)', wordBreak: 'keep-all' }}>
                  {cellInfo.title}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-ink)', letterSpacing: '-0.01em', wordBreak: 'keep-all', lineHeight: 1.3 }}>
              {cellInfo.title || '(제목 없음)'}
            </div>
          )}
        </div>
      </div>
    )}
    </div>
  );
};

export default VenueGrid;
