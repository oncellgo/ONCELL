import React from 'react';
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
  onSlotClick?: (venue: Venue, slotMin: number, blocked: boolean) => void;
  renderRowExtra?: (venue: Venue) => React.ReactNode;
  showActionColumn?: boolean;
};

const VenueGrid = ({ venues: venuesProp, blocks = [], groups = [], selectedDate, slotMin = SLOT_MIN, availableStart = '06:00', availableEnd = '22:00', selectedSlots, alternateSlots, onSlotClick, renderRowExtra, showActionColumn = false }: Props) => {
  const isMobile = useIsMobile();
  const blockedByVenue = computeBlockedSlotsForDate(groups, selectedDate);

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
        map.get(g.venueId)!.set(s.startMin, g.reason || '블럭');
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

  // 가로 = 장소 / 세로 = 시간
  const availableStartMin = toMin(availableStart);
  const availableEndMin = toMin(availableEnd);

  const TIME_HOUR_W = isMobile ? 28 : 34;
  const TIME_MIN_W = isMobile ? 26 : 32;
  const VENUE_MIN_W = isMobile ? 44 : 52;
  // 모바일에서 장소가 많아 가로폭 부족 → 가로 스크롤이 자연스럽게 작동하도록 minWidth 적용
  const tableMinWidth = isMobile ? TIME_HOUR_W + TIME_MIN_W + venues.length * VENUE_MIN_W : undefined;
  return (
    <div className="responsive-x-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--color-surface-border)', borderRadius: 10, background: '#fff' }}>
      <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'collapse', fontSize: isMobile ? '0.68rem' : '0.72rem', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: TIME_HOUR_W }} />
          <col style={{ width: TIME_MIN_W }} />
          {venues.map((v) => <col key={v.id} style={{ minWidth: VENUE_MIN_W }} />)}
        </colgroup>
        <thead>
          <tr style={{ background: '#ECFCCB' }}>
            <th colSpan={2} style={{ padding: '0.25rem 0.4rem', position: 'sticky', left: 0, background: '#ECFCCB', textAlign: 'center', borderRight: '1px solid #D9F09E', zIndex: 2, fontSize: '0.72rem', fontWeight: 800 }}>시간</th>
            {venues.map((v) => (
              <th key={v.id} style={{ padding: '0.25rem 0.15rem', borderRight: '1px solid #F1F5F9', color: '#4D7C0F', fontWeight: 700, minWidth: VENUE_MIN_W, verticalAlign: 'middle', lineHeight: 1.1 }}>
                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '0.62rem', color: '#334155', fontWeight: 700 }}>{v.floor}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-ink)' }}>{v.name}</span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--color-ink-2)', fontFamily: 'monospace' }}>{v.code}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            // 각 venue별 슬롯 정보 사전계산: 연속된 같은 (reason, kind, 예약자)의 블럭을 rowSpan으로 묶음
            type SlotInfo = { blocked: boolean; reason: string; kind: 'event' | 'reservation' | 'block'; reserverName?: string; reserverContact?: string; isStart: boolean; span: number };
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
                    break;
                  }
                }
                return { blocked, reason, kind, reserverName, reserverContact, isStart: false, span: 1 };
              });
              for (let i = 0; i < infos.length; i++) {
                if (!infos[i].blocked) continue;
                const prev = infos[i - 1];
                const samePrev = i > 0 && prev.blocked && prev.reason === infos[i].reason && prev.kind === infos[i].kind && prev.reserverName === infos[i].reserverName;
                if (!samePrev) {
                  infos[i].isStart = true;
                  let span = 1;
                  while (i + span < infos.length && infos[i + span].blocked && infos[i + span].reason === infos[i].reason && infos[i + span].kind === infos[i].kind && infos[i + span].reserverName === infos[i].reserverName) span++;
                  infos[i].span = span;
                }
              }
              venueSlotInfos.set(v.id, infos);
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
            return (
              <tr key={m} style={{ borderTop: isHourStart ? '1.5px solid #D9F09E' : '1px solid #F4F4F0' }}>
                {showHourCell && (
                  <td
                    rowSpan={hourRowSpan}
                    style={{
                      padding: '0 0.25rem',
                      position: 'sticky',
                      left: 0,
                      background: '#FFFFFF',
                      borderRight: '1px solid #E5E7EB',
                      color: '#0F172A',
                      fontWeight: 400,
                      fontSize: '1.05rem',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      zIndex: 1,
                      lineHeight: 1,
                    }}
                  >{hour}</td>
                )}
                <td style={{ padding: '0 0.3rem', position: 'sticky', left: TIME_HOUR_W, background: '#FFFFFF', borderRight: '1.5px solid #D9F09E', color: '#4D7C0F', fontWeight: 400, fontSize: '0.68rem', whiteSpace: 'nowrap', textAlign: 'right', zIndex: 1, opacity: 0.85 }}>:{String(minPart).padStart(2, '0')}</td>
                {venues.map((v) => {
                  const info = venueSlotInfos.get(v.id)?.[rowIdx];
                  // 블럭 연속 영역의 첫 행 외에는 위 행이 rowSpan으로 덮으므로 td 자체를 생략
                  if (info && info.blocked && !info.isStart) return null;
                  const isAvailableDay = v.availableDays.includes(selectedDow);
                  const inAvailable = isAvailableDay && m >= availableStartMin && m < availableEndMin;
                  const blocked = info?.blocked || false;
                  const reason = info?.reason || '';
                  const span = info?.span || 1;
                  const kind = info?.kind || 'block';
                  const reserverName = info?.reserverName;
                  const reserverContact = info?.reserverContact;
                  const isSelected = !!selectedSlots?.get(v.id)?.has(m);
                  const isAlternate = !isSelected && !blocked && inAvailable && !!alternateSlots?.get(v.id)?.has(m);
                  // 사용자 선택이 기존 예약/블럭과 겹치면 "예약불가" 경고 상태
                  const isConflict = isSelected && blocked;
                  // 색상: 충돌=주황경고, 선택=민트, 대체=반투명민트+점선, 불가시간=연회색, 교회일정=진빨강, 사용자예약=중간회색, 관리자블럭=어두운회색, 예약가능=연녹
                  const kindBg = kind === 'event' ? '#DC2626' : kind === 'reservation' ? '#9CA3AF' : '#4B5563';
                  const kindFg = '#FFFFFF';
                  const bg = isConflict ? '#F59E0B' : isSelected ? '#20CD8D' : isAlternate ? 'rgba(32, 205, 141, 0.18)' : (!inAvailable ? '#E5E7EB' : blocked ? kindBg : '#F7FEE7');
                  const color = isConflict ? '#FFFFFF' : isSelected ? '#fff' : isAlternate ? '#3F6212' : (!inAvailable ? '#9CA3AF' : blocked ? kindFg : '#4D7C0F');
                  const clickable = !!onSlotClick && inAvailable;
                  const kindLabel = kind === 'event' ? '교회일정' : kind === 'reservation' ? '예약됨' : '블럭';
                  const titleParts = [`${v.floor} ${v.name} ${toHHMM(m)}`];
                  if (!inAvailable) titleParts.push('예약 불가 시간대');
                  else if (blocked) {
                    titleParts.push(`${kindLabel}: ${reason}`);
                    if (kind === 'reservation' && reserverName) titleParts.push(`예약자: ${reserverName}`);
                    if (kind === 'reservation' && reserverContact) titleParts.push(`연락처: ${reserverContact}`);
                  } else if (isSelected) titleParts.push('선택됨 (클릭하여 해제)');
                  else if (isAlternate) titleParts.push('후보 (클릭하여 이 장소로 전환)');
                  else titleParts.push('예약 가능 — 클릭하여 선택');
                  // 셀 내부: reservation kind이고 rowSpan≥2면 3줄 표시, 그 외엔 reason만
                  const showStacked = blocked && kind === 'reservation' && span >= 2 && (reserverName || reserverContact);
                  return (
                    <td key={v.id} rowSpan={blocked ? span : 1} style={{ padding: 0, borderRight: '1px solid #F4F4F0', minWidth: VENUE_MIN_W }}>
                      <button
                        type="button"
                        disabled={!clickable}
                        onClick={() => onSlotClick && onSlotClick(v, m, blocked)}
                        title={titleParts.join(' | ')}
                        style={{ width: '100%', height: blocked ? span * 20 : 20, border: isAlternate ? '1.5px dashed #20CD8D' : 'none', background: bg, color, cursor: clickable ? 'pointer' : 'not-allowed', fontSize: '0.6rem', fontWeight: 700, lineHeight: 1.15, padding: blocked ? '2px 4px' : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'normal', wordBreak: 'keep-all', verticalAlign: 'middle', boxSizing: 'border-box' }}
                      >
                        {isConflict ? '예약불가' : isSelected ? '예약가능' : isAlternate ? '○' : (blocked ? (
                          showStacked ? (
                            <span style={{ display: 'grid', gap: 1, lineHeight: 1.1 }}>
                              <span style={{ fontWeight: 800 }}>{reason || kindLabel}</span>
                              {reserverName && <span style={{ fontWeight: 600, opacity: 0.95 }}>{reserverName}</span>}
                              {reserverContact && <span style={{ fontWeight: 500, opacity: 0.9, fontSize: '0.55rem' }}>{reserverContact}</span>}
                            </span>
                          ) : (reason || kindLabel)
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
  );
};

export default VenueGrid;
