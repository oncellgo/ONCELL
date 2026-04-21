import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import SubHeader from '../../components/SubHeader';
import VenueGrid, { Venue, Block, BlockGroup, dateKey } from '../../components/VenueGrid';
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
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const ReservationGridPage = ({ venues, blocks, groups, slotMin, availableStart, availableEnd, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const isMobile = useIsMobile();
  useRequireLogin(profileId);

  // 두 선택 모두 필수 — date 은 기본 오늘로 프리셋, venue 는 미선택 시작
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [selectedVenueIds, setSelectedVenueIds] = useState<Set<string>>(new Set());
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

  const handleSlotClick = (venue: Venue, startMin: number, blocked: boolean) => {
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

  // 선택을 '장소예약' 페이지로 넘기는 deep-link
  const reservationDeepLink = (() => {
    if (!activeVenueId || totalSelectedSlots === 0) return null;
    const sortedMins = Array.from(activeSlots).sort((a, b) => a - b);
    const startMin = sortedMins[0];
    const endMin = sortedMins[sortedMins.length - 1] + slotMin;
    const qs = new URLSearchParams();
    if (profileId) qs.set('profileId', profileId);
    qs.set('date', selectedDate);
    qs.set('venueId', activeVenueId);
    qs.set('start', String(startMin));
    qs.set('end', String(endMin));
    return `/reservation?${qs.toString()}`;
  })();

  // 선택 구간 텍스트 요약 (예: "17:00~18:30")
  const selectionLabel = (() => {
    if (totalSelectedSlots === 0 || !activeVenueId) return null;
    const v = venues.find((x) => x.id === activeVenueId);
    const sorted = Array.from(activeSlots).sort((a, b) => a - b);
    const startMin = sorted[0];
    const endMin = sorted[sorted.length - 1] + slotMin;
    const pad = (n: number) => String(n).padStart(2, '0');
    const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    return v ? `${v.floor} ${v.name} · ${hhmm(startMin)}~${hhmm(endMin)}` : `${hhmm(startMin)}~${hhmm(endMin)}`;
  })();

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
        <title>KCIS | 예약현황표</title>
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
          <h1 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.3rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>📊 예약현황표</h1>

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
                onClick={() => setVenueOpen(true)}
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
              <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.76rem', color: 'var(--color-ink-2)', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#F7FEE7', border: '1px solid #D9F09E' }} /> 예약 가능
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#DC2626' }} /> 교회일정
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#9CA3AF' }} /> 예약됨
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: '#4B5563' }} /> 관리자 블럭
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
              />

              {/* 선택 요약 + 예약하기 바로가기 */}
              {totalSelectedSlots > 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap',
                  padding: '0.7rem 0.9rem', borderRadius: 12,
                  background: '#ECFDF5', border: '1px solid #20CD8D',
                }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-primary-deep)' }}>
                    ✓ {selectionLabel}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={clearSelectedSlots}
                      style={{ padding: '0.45rem 0.85rem', minHeight: 40, borderRadius: 999, border: '1px solid #6B7280', background: '#fff', color: '#374151', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                    >선택 해제</button>
                    {reservationDeepLink && (
                      <a
                        href={reservationDeepLink}
                        style={{ padding: '0.45rem 0.9rem', minHeight: 40, display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: '0.82rem', fontWeight: 800, textDecoration: 'none' }}
                      >📍 이 시간으로 예약</a>
                    )}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
                  💡 <strong>팁:</strong> 빈 시간(연라임)을 클릭해서 토글 선택할 수 있어요. 예약을 원하는 시간대의 연결된 블럭들을 순서대로 선택하세요.
                </p>
              )}
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
  const settings = (settingsObj || {}) as { venueSlotMin?: number; venueAvailableStart?: string; venueAvailableEnd?: string };
  const slotMin = settings.venueSlotMin === 60 ? 60 : 30;
  const availableStart = typeof settings.venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableStart) ? settings.venueAvailableStart : '06:00';
  const availableEnd = typeof settings.venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableEnd) ? settings.venueAvailableEnd : '22:00';

  const profileId = queryProfileId;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;

  let displayName: string | null = nickname;
  if (profileId) {
    try {
      const p = (profilesArr as Array<any>).find((x) => x.profileId === profileId);
      displayName = p?.realName || nickname || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });

  return { props: { venues, blocks, groups, slotMin, availableStart, availableEnd, profileId, displayName, nickname, email, systemAdminHref } };
};

export default ReservationGridPage;
