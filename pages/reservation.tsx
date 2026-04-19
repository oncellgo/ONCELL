import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import SubHeader from '../components/SubHeader';
import VenueGrid, { Venue, Block, BlockGroup, dateKey, toHHMM, toMin as toMinLocal } from '../components/VenueGrid';
import RequiredInfoModal from '../components/RequiredInfoModal';
import DateTimePicker from '../components/DateTimePicker';
import { getSystemAdminHref } from '../lib/adminGuard';
import { useIsMobile } from '../lib/useIsMobile';
import { expandOccurrences, EventRow as RawEventRow } from '../lib/recurrence';
import {
  getVenues,
  getVenueBlocks,
  getVenueBlockGroups,
  getSettings,
  getEvents,
  getProfiles,
  getUsers,
} from '../lib/dataStore';

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

const ReservationPage = ({ venues, blocks, groups, slotMin, availableStart, availableEnd, profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState<string>(dateKey(new Date()));
  const [effectiveProfileId, setEffectiveProfileId] = useState<string | null>(profileId);
  const [missingFields, setMissingFields] = useState<Array<'realName' | 'contact'>>([]);
  const [showRequiredModal, setShowRequiredModal] = useState(false);

  // 인라인 선택 상태: venueId → Set<startMin>
  const [selectedSlots, setSelectedSlots] = useState<Map<string, Set<number>>>(new Map());
  const [resvTitle, setResvTitle] = useState('');
  const [resvSubmitting, setResvSubmitting] = useState(false);
  const [resvError, setResvError] = useState<string | null>(null);

  // 날짜 바뀌면 선택 초기화
  useEffect(() => { setSelectedSlots(new Map()); setResvError(null); }, [selectedDate]);

  const totalSelected = Array.from(selectedSlots.values()).reduce((acc, s) => acc + s.size, 0);

  const handleSlotClick = (v: Venue, startMin: number, blocked: boolean) => {
    if (blocked) return;
    if (!effectiveProfileId) { window.location.href = '/auth/login'; return; }
    if (missingFields.length > 0) { setShowRequiredModal(true); return; }
    setSelectedSlots((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(v.id) || []);
      if (set.has(startMin)) set.delete(startMin);
      else set.add(startMin);
      if (set.size === 0) next.delete(v.id);
      else next.set(v.id, set);
      return next;
    });
  };

  // 선택된 슬롯을 venue별 연속 범위로 묶어 예약
  const submitReservations = async () => {
    if (!effectiveProfileId) return;
    if (totalSelected === 0) { setResvError('예약할 시간을 먼저 선택하세요.'); return; }
    if (!resvTitle.trim()) { setResvError('제목을 입력하세요.'); return; }
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
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId: 'kcis',
            profileId: effectiveProfileId,
            title: resvTitle.trim(),
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

  // 페이지 진입 시 날짜+장소 선택 모달
  const [pickerOpen, setPickerOpen] = useState(true);
  const [pickerDate, setPickerDate] = useState<string>(dateKey(new Date()));
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

  const togglePickerVenue = (id: string) => setPickerSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleFloor = (floor: string) => setPickerSelected((prev) => {
    const next = new Set(prev);
    const floorIds = venues.filter((v) => v.floor === floor).map((v) => v.id);
    const allOn = floorIds.every((id) => next.has(id));
    if (allOn) floorIds.forEach((id) => next.delete(id));
    else floorIds.forEach((id) => next.add(id));
    return next;
  });
  const selectAll = () => setPickerSelected(new Set(venues.map((v) => v.id)));
  const clearAll = () => setPickerSelected(new Set());

  // 시간 선택 (모달): 시작 시각(0~23시, 0/15/30/45분) + 지속시간(0.5~12시간)
  const [pickerStartHour, setPickerStartHour] = useState<number>(10);
  const [pickerStartMin, setPickerStartMin] = useState<number>(0);
  const [pickerDurationHours, setPickerDurationHours] = useState<number>(1);

  const confirmPicker = () => {
    if (pickerSelected.size === 0) { alert('한 개 이상의 장소를 선택하세요.'); return; }
    setSelectedDate(pickerDate);
    setConfirmedVenueIds(new Set(pickerSelected));
    setPickerOpen(false);
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

      <main style={{ maxWidth: 1040, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: '1rem' }}>
        <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>장소예약</h2>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  const [y, m, d] = selectedDate.split('-').map(Number);
                  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() - 1);
                  const p = (n: number) => String(n).padStart(2, '0');
                  setSelectedDate(`${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`);
                }}
                aria-label="이전날"
                style={{ padding: '0.5rem 0.95rem', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.92rem', cursor: 'pointer', boxShadow: '0 2px 6px rgba(32, 205, 141, 0.25)' }}
              >‹ 이전날</button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ padding: '0.45rem 0.65rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-ink)', textAlign: 'center' }}
              />
              <button
                type="button"
                onClick={() => {
                  const [y, m, d] = selectedDate.split('-').map(Number);
                  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + 1);
                  const p = (n: number) => String(n).padStart(2, '0');
                  setSelectedDate(`${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`);
                }}
                aria-label="다음날"
                style={{ padding: '0.5rem 0.95rem', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.92rem', cursor: 'pointer', boxShadow: '0 2px 6px rgba(32, 205, 141, 0.25)' }}
              >다음날 ›</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--color-ink-2)', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#F7FEE7', border: '1px solid #D9F09E' }} /> 예약 가능</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#6B7280' }} /> 블럭됨</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: '#E5E7EB' }} /> 예약 불가 시간</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => { setPickerDate(selectedDate); setPickerSelected(new Set(confirmedVenueIds)); setPickerOpen(true); }}
              style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
            >날짜·장소 변경</button>
          </div>
          <VenueGrid
            venues={visibleVenues}
            blocks={blocks}
            groups={groups}
            selectedDate={selectedDate}
            slotMin={slotMin}
            availableStart={availableStart}
            availableEnd={availableEnd}
            selectedSlots={selectedSlots}
            onSlotClick={handleSlotClick}
          />

          {totalSelected > 0 && (
            <div style={{ padding: '0.85rem 1rem', borderRadius: 12, background: '#ECFDF5', border: '1px solid #20CD8D', display: 'grid', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, background: '#20CD8D', color: '#fff', fontWeight: 800, fontSize: '0.82rem' }}>선택 {totalSelected}칸</span>
                <button type="button" onClick={() => setSelectedSlots(new Map())} style={{ padding: '0.3rem 0.65rem', borderRadius: 8, border: '1px solid #A7F3D0', background: '#fff', color: '#065F46', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>전체 해제</button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  value={resvTitle}
                  onChange={(e) => setResvTitle(e.target.value)}
                  placeholder="예약 제목 (필수)"
                  style={{ flex: '1 1 220px', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.92rem' }}
                />
                <button
                  type="button"
                  disabled={resvSubmitting}
                  onClick={submitReservations}
                  style={{ padding: '0.6rem 1.2rem', borderRadius: 10, border: 'none', background: resvSubmitting ? '#9CA3AF' : 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: resvSubmitting ? 'not-allowed' : 'pointer' }}
                >{resvSubmitting ? '저장 중...' : '예약하기'}</button>
              </div>
              {resvError && <p style={{ margin: 0, fontSize: '0.82rem', color: '#DC2626', fontWeight: 700 }}>{resvError}</p>}
            </div>
          )}

          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>녹색 셀을 클릭하면 토글되어 선택됩니다. 여러 칸을 선택한 뒤 한번에 예약할 수 있습니다.</p>
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
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>예약시간/장소 선택</h3>
              <button type="button" onClick={() => setPickerOpen(false)} aria-label="닫기" style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-ink-2)' }}>✕</button>
            </div>

            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'grid', gap: '1rem' }}>
              {/* === 섹션 1: 예약시간 선택 === */}
              <div style={{ display: 'grid', gap: '0.6rem', padding: '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '1rem' }}>⏰</span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#3F6212' }}>예약시간 선택</span>
                </div>

                {/* 날짜 + 요일 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>날짜</span>
                  <DateTimePicker
                    dateOnly
                    value={`${pickerDate}T00:00`}
                    onChange={(v) => setPickerDate(v.slice(0, 10))}
                    placeholder="날짜 선택"
                    buttonStyle={{
                      width: '100%',
                      background: '#fff',
                      border: '1.5px solid var(--color-primary)',
                      color: 'var(--color-ink)',
                      fontWeight: 800,
                      fontSize: '1rem',
                      padding: '0.55rem 0.75rem',
                      textAlign: 'center',
                    }}
                  />
                  {(() => {
                    const [y, m, d] = pickerDate.split('-').map(Number);
                    if (!y || !m || !d) return null;
                    const dow = new Date(y, m - 1, d).getDay();
                    const labels = ['일', '월', '화', '수', '목', '금', '토'];
                    const color = dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink-2)';
                    return (
                      <span style={{ color, fontWeight: 800, fontSize: '0.92rem', minWidth: 36, textAlign: 'right' }}>{labels[dow]}요일</span>
                    );
                  })()}
                </div>

                {/* 시작 + 지속 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>시작</span>
                  <select
                    value={pickerStartHour}
                    onChange={(e) => setPickerStartHour(Number(e.target.value))}
                    style={{ padding: '0.55rem 0.5rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem', fontWeight: 700, background: '#fff' }}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}시</option>
                    ))}
                  </select>
                  <select
                    value={pickerStartMin}
                    onChange={(e) => setPickerStartMin(Number(e.target.value))}
                    style={{ padding: '0.55rem 0.5rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem', fontWeight: 700, background: '#fff' }}
                  >
                    {[0, 15, 30, 45].map((mm) => (
                      <option key={mm} value={mm}>{String(mm).padStart(2, '0')}분</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>지속</span>
                  <select
                    value={pickerDurationHours}
                    onChange={(e) => setPickerDurationHours(Number(e.target.value))}
                    style={{ padding: '0.55rem 0.5rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem', fontWeight: 700, background: '#fff' }}
                  >
                    {[0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12].map((h) => (
                      <option key={h} value={h}>{h}시간</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* === 섹션 2: 장소 선택 === */}
              <div style={{ display: 'grid', gap: '0.55rem', padding: '0.85rem 1rem', borderRadius: 12, background: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1rem' }}>📍</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#075985' }}>장소 선택</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>({pickerSelected.size}/{venues.length})</span>
                  </div>
                  <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                    <button type="button" onClick={selectAll} style={{ padding: '0.3rem 0.65rem', borderRadius: 6, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>전체 선택</button>
                    <button type="button" onClick={clearAll} style={{ padding: '0.3rem 0.65rem', borderRadius: 6, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>전체 해제</button>
                  </div>
                </div>

                {venuesByFloor.map(([floor, list]) => {
                  const floorIds = list.map((v) => v.id);
                  const floorAllOn = floorIds.every((id) => pickerSelected.has(id));
                  const floorSomeOn = floorIds.some((id) => pickerSelected.has(id));
                  return (
                    <div key={floor} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.45rem 0.6rem', border: '1px solid var(--color-surface-border)', borderRadius: 10, background: '#FAFAF7', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.88rem', fontWeight: 800, color: '#3F6212', cursor: 'pointer', flex: '0 0 auto', paddingTop: '0.25rem' }}>
                        <input
                          type="checkbox"
                          checked={floorAllOn}
                          ref={(el) => { if (el) el.indeterminate = !floorAllOn && floorSomeOn; }}
                          onChange={() => toggleFloor(floor)}
                        />
                        {floor}
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', flex: 1, minWidth: 0 }}>
                        {list.map((v) => {
                          const on = pickerSelected.has(v.id);
                          return (
                            <label key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.55rem', borderRadius: 8, background: on ? '#F7FEE7' : '#fff', border: on ? '1px solid #65A30D' : '1px solid var(--color-surface-border)', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                              <input type="checkbox" checked={on} onChange={() => togglePickerVenue(v.id)} />
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
                style={{ padding: '0.55rem 1.1rem', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >완료</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const [venuesArr, blocksArr, groupsArr, settingsObj, eventsArr] = await Promise.all([
    getVenues().catch(() => [] as any[]),
    getVenueBlocks().catch(() => [] as any[]),
    getVenueBlockGroups().catch(() => [] as any[]),
    getSettings().catch(() => ({} as any)),
    getEvents().catch(() => [] as any[]),
  ]);
  const venues = venuesArr as Venue[];
  const adhocBlocks = blocksArr as Block[];
  const groups = groupsArr as BlockGroup[];
  const allEvents = eventsArr as RawEventRow[];

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
    eventBlocks.push({
      id: `occ-${occ.occurrenceId}`,
      venueId: vid,
      startAt: occ.startAt,
      endAt: occ.endAt,
      reason: occ.title,
    });
  }
  const blocks: Block[] = [...adhocBlocks, ...eventBlocks];
  const settings = (settingsObj || {}) as { venueSlotMin?: number; venueAvailableStart?: string; venueAvailableEnd?: string };
  const slotMin = settings.venueSlotMin === 60 ? 60 : 30;
  const availableStart = typeof settings.venueAvailableStart === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableStart) ? settings.venueAvailableStart : '06:00';
  const availableEnd = typeof settings.venueAvailableEnd === 'string' && /^\d{2}:\d{2}$/.test(settings.venueAvailableEnd) ? settings.venueAvailableEnd : '22:00';

  const profileId = typeof ctx.query.profileId === 'string' ? ctx.query.profileId : null;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;

  let displayName: string | null = nickname;
  if (profileId) {
    try {
      const [profiles, users] = await Promise.all([
        getProfiles().catch(() => [] as any[]),
        getUsers().catch(() => [] as any[]),
      ]);
      const p = (profiles as Array<any>).find((x) => x.profileId === profileId);
      const u = (users as Array<any>).find((x) => x.providerProfileId === profileId);
      displayName = p?.realName || u?.realName || u?.nickname || nickname || null;
    } catch {}
  }

  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });

  return { props: { venues, blocks, groups, slotMin, availableStart, availableEnd, profileId, displayName, nickname, email, systemAdminHref } };
};

export default ReservationPage;
