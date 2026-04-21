import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';
import { isAllDayEvent, getSGDateKey } from '../lib/events';

export type Community = { id: string; name: string; timezone?: string };

export type EventRow = {
  id: string;
  communityId: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  description?: string;
  createdByName?: string;
  scope?: 'community' | 'personal';
  shared?: boolean;
};

export type WorshipService = {
  id: string;
  communityId: string;
  name: string;
  startAt?: string;
  isDefault?: boolean;
};

type Props = {
  communities: Community[];
  events: EventRow[];
  worshipServices: WorshipService[];
  defaultCommunityId: string;
  showCommunitySelector?: boolean;
  showIcsSubscription?: boolean;
  addEventHref?: string;
};

const ScheduleView = ({ communities, events, worshipServices, defaultCommunityId, showCommunitySelector = true, showIcsSubscription = true, addEventHref }: Props) => {
  const isMobile = useIsMobile();
  const [calCommunityId, setCalCommunityId] = useState(defaultCommunityId);
  const [calView, setCalView] = useState<{ year: number; month: number } | null>(null);
  const [calSlideDir, setCalSlideDir] = useState<'left' | 'right' | null>(null);
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(null);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [scheduleTab, setScheduleTab] = useState<'week' | 'month'>('week');
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0);  // 주간 섹션 전용 주 이동

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const community = communities.find((c) => c.id === calCommunityId);
  const icsUrl = calCommunityId && origin ? `${origin}/api/communities/${calCommunityId}/calendar` : '';
  const webcalUrl = icsUrl.replace(/^https?:/, 'webcal:');
  const gcalUrl = icsUrl ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(icsUrl)}` : '';

  const communityTz = community?.timezone || 'Asia/Seoul';
  const formatInTz = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: communityTz, ...opts }).formatToParts(d);
  const toKey = (d: Date) => {
    const parts = formatInTz(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    const da = parts.find((p) => p.type === 'day')!.value;
    return `${y}-${m}-${da}`;
  };
  const now = new Date();
  const todayKey = toKey(now);
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

  const scopedEvents = events.filter((e) => e.communityId === calCommunityId);
  const scopedWorship = worshipServices.filter((s) => s.startAt && s.communityId === calCommunityId);

  const eventsByDay = new Map<string, EventRow[]>();
  scopedEvents.forEach((ev) => {
    // 종일 이벤트는 SG(UTC+8) 기준 start_at 날짜 하나에만 버킷팅 — 브라우저/커뮤니티 TZ와 무관.
    if (isAllDayEvent(ev.startAt, ev.endAt)) {
      const k = getSGDateKey(ev.startAt);
      if (k) {
        if (!eventsByDay.has(k)) eventsByDay.set(k, []);
        eventsByDay.get(k)!.push(ev);
      }
      return;
    }
    const startKey = toKey(new Date(ev.startAt));
    const endKey = toKey(new Date(ev.endAt));
    const [sy, sm, sd] = startKey.split('-').map(Number);
    const [ey, em, ed] = endKey.split('-').map(Number);
    let cursor = new Date(sy, sm - 1, sd);
    const endLocal = new Date(ey, em - 1, ed);
    let safety = 0;
    while (cursor.getTime() <= endLocal.getTime() && safety < 400) {
      const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (!eventsByDay.has(k)) eventsByDay.set(k, []);
      eventsByDay.get(k)!.push(ev);
      cursor.setDate(cursor.getDate() + 1);
      safety++;
    }
  });
  scopedWorship.forEach((s) => {
    const d = new Date(s.startAt!);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const pseudo: any = {
      id: s.id,
      communityId: s.communityId,
      title: s.name,
      startAt: s.startAt,
      endAt: s.startAt,
      scope: 'worship',
    };
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(pseudo);
  });
  // 각 날짜 안의 일정을 시작 시각 오름차순 정렬
  for (const list of eventsByDay.values()) {
    list.sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
  }

  const prevMonth = monthIdx === 0 ? 12 : monthIdx;
  const nextMonth = monthIdx === 11 ? 1 : monthIdx + 2;
  const goPrev = () => { setCalSlideDir('right'); setCalView({ year: monthIdx === 0 ? year - 1 : year, month: prevMonth }); };
  const goNext = () => { setCalSlideDir('left'); setCalView({ year: monthIdx === 11 ? year + 1 : year, month: nextMonth }); };
  const yearOptions: number[] = [];
  for (let y = year - 5; y <= year + 5; y++) yearOptions.push(y);

  const panelKey = selectedCalDay || todayKey;
  const dayEvents = eventsByDay.get(panelKey) || [];
  const dateObj = new Date(`${panelKey}T00:00`);
  const dowLabel = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
  const dateLabel = `${dateObj.getFullYear()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')} (${dowLabel})${panelKey === todayKey ? ' · 오늘' : ''}`;

  const copyIcs = async () => {
    try { await navigator.clipboard.writeText(icsUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const [tY, tM, tD] = todayKey.split('-').map(Number);
  const todayLocal = new Date(tY, tM - 1, tD);
  const dowToday = todayLocal.getDay();
  const weekDays: Array<{ key: string; date: Date; events: EventRow[] }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(tY, tM - 1, tD - dowToday + i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weekDays.push({ key: k, date: d, events: eventsByDay.get(k) || [] });
  }
  const weekRangeLabel = (() => {
    const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
    const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}(${dowLabels[d.getDay()]})`;
    return `${fmt(weekDays[0].date)}~${fmt(weekDays[6].date)}`;
  })();
  const totalWeekEvents = weekDays.reduce((sum, d) => sum + d.events.length, 0);

  // 예배일정 카드: 향후 14일 이내 예배(이벤트 scope='worship' + worship-services) 상위 몇 개
  const worshipUpcoming = (() => {
    const nowTs = Date.now();
    const horizon = nowTs + 14 * 24 * 60 * 60 * 1000;
    const fromEvents = scopedEvents
      .filter((e: any) => e.scope === 'worship')
      .map((e) => ({ id: e.id, title: e.title, startAt: e.startAt }));
    const fromWs = scopedWorship
      .filter((s) => s.startAt)
      .map((s) => ({ id: s.id, title: s.name, startAt: s.startAt! }));
    const merged = [...fromEvents, ...fromWs]
      .filter((x) => {
        const t = new Date(x.startAt).getTime();
        return t >= nowTs && t <= horizon;
      })
      .sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
    // 중복 (같은 시각 같은 제목) 제거
    const seen = new Set<string>();
    const dedup: typeof merged = [];
    for (const x of merged) {
      const k = `${x.startAt}|${x.title}`;
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(x);
    }
    return dedup.slice(0, 5);
  })();

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {showCommunitySelector && communities.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <select
            value={calCommunityId}
            onChange={(e) => setCalCommunityId(e.target.value)}
            style={{ padding: '0.45rem 0.7rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontSize: '0.88rem', fontWeight: 600 }}
          >
            {communities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* === 이번주 일정 (사용자 상단 뷰) — 일~토 세로 나열 + 주 이동 === */}
      {(() => {
        // 선택된 주의 일요일 기준 (scheduleWeekOffset 만큼 이동)
        const base = new Date();
        base.setHours(0, 0, 0, 0);
        base.setDate(base.getDate() - base.getDay() + scheduleWeekOffset * 7);
        const pad = (n: number) => String(n).padStart(2, '0');
        const kOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const days: Array<{ key: string; date: Date; dow: number }> = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(base);
          d.setDate(base.getDate() + i);
          days.push({ key: kOf(d), date: d, dow: i });
        }
        const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
        const weekLabel = scheduleWeekOffset === 0 ? '이번주' : scheduleWeekOffset === -1 ? '지난주' : scheduleWeekOffset === 1 ? '다음주' : scheduleWeekOffset > 0 ? `+${scheduleWeekOffset}주` : `${scheduleWeekOffset}주`;
        const rangeText = `${days[0].date.getMonth() + 1}/${days[0].date.getDate()} ~ ${days[6].date.getMonth() + 1}/${days[6].date.getDate()}`;
        return (
          <section style={{ padding: isMobile ? '0.9rem 0.85rem' : '1.25rem 1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.15rem', fontWeight: 800, color: '#3F6212', letterSpacing: '-0.01em' }}>📅 {weekLabel} 일정</h2>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <button type="button" onClick={() => setScheduleWeekOffset((w) => w - 1)} aria-label="이전주"
                  style={{ padding: '0.3rem 0.7rem', borderRadius: 10, border: '1px solid #D9F09E', background: '#fff', color: '#65A30D', fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer' }}>‹</button>
                <span style={{ padding: '0.3rem 0.8rem', borderRadius: 999, background: '#ECFCCB', color: '#3F6212', fontSize: isMobile ? '0.85rem' : '0.9rem', fontWeight: 800 }}>{rangeText}</span>
                <button type="button" onClick={() => setScheduleWeekOffset((w) => w + 1)} aria-label="다음주"
                  style={{ padding: '0.3rem 0.7rem', borderRadius: 10, border: '1px solid #D9F09E', background: '#fff', color: '#65A30D', fontSize: '1.05rem', fontWeight: 800, cursor: 'pointer' }}>›</button>
                {scheduleWeekOffset !== 0 && (
                  <button type="button" onClick={() => setScheduleWeekOffset(0)}
                    style={{ padding: '0.25rem 0.6rem', borderRadius: 999, border: '1px solid #65A30D', background: '#fff', color: '#65A30D', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}>오늘</button>
                )}
              </div>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
              {days.map((d) => {
                const list = (eventsByDay.get(d.key) || []).filter((e: any) => (e.type || 'event') !== 'reservation');
                const isToday = d.key === todayKey;
                const dowColor = d.dow === 0 ? '#DC2626' : d.dow === 6 ? '#2563EB' : 'var(--color-ink)';
                return (
                  <li key={d.key} style={{ display: 'grid', gridTemplateColumns: isMobile ? '72px 1fr' : '96px 1fr', gap: isMobile ? '0.5rem' : '0.75rem', padding: isMobile ? '0.5rem 0.6rem' : '0.6rem 0.8rem', borderRadius: 10, background: isToday ? '#F7FEE7' : '#F9FCFB', border: `1px solid ${isToday ? '#D9F09E' : 'var(--color-surface-border)'}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.15rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: dowColor }}>{DOWS[d.dow]}요일</span>
                      <span style={{ fontSize: isMobile ? '1rem' : '1.1rem', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1 }}>{d.date.getMonth() + 1}.{d.date.getDate()}</span>
                      {isToday && <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fff', background: 'var(--color-primary)', padding: '0.05rem 0.35rem', borderRadius: 999 }}>오늘</span>}
                    </div>
                    <div style={{ display: 'grid', gap: '0.25rem', alignContent: 'center' }}>
                      {list.length === 0 ? (
                        <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>—</span>
                      ) : list.map((ev: any) => (
                        <div key={ev.id} style={{ fontSize: isMobile ? '0.85rem' : '0.9rem', color: 'var(--color-ink)', fontWeight: 600 }}>
                          · {ev.title}
                          {ev.location && <span style={{ color: 'var(--color-ink-2)', fontSize: '0.78rem', marginLeft: '0.35rem' }}>📍 {ev.location}</span>}
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--color-ink-2)', lineHeight: 1.5 }}>※ 교회의 사정에 따라 일정은 변경될 수 있습니다.</p>
          </section>
        );
      })()}

      {showIcsSubscription && icsUrl && (
        <section style={{ padding: isMobile ? '0.9rem 0.85rem' : '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.2rem', color: 'var(--color-ink)' }}>Google 캘린더 구독</h2>
          <a href={gcalUrl} target="_blank" rel="noreferrer" style={{ padding: '0.75rem 1rem', borderRadius: 10, background: 'var(--color-primary)', color: '#ffffff', fontWeight: 700, textDecoration: 'none', fontSize: '0.9rem', boxShadow: 'var(--shadow-button)', textAlign: 'center' }}>+ Google 캘린더에 추가</a>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label style={{ color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.88rem' }}>구독 URL</label>
            <input readOnly value={icsUrl} onClick={(e) => (e.target as HTMLInputElement).select()} style={{ padding: '0.65rem 0.85rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#F9FCFB', color: 'var(--color-ink-2)', fontSize: '0.82rem', fontFamily: 'monospace' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button type="button" onClick={copyIcs} style={{ padding: '0.6rem 0.9rem', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>{copied ? '복사됨!' : '복사'}</button>
              <a href={webcalUrl} style={{ padding: '0.6rem 0.9rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, fontSize: '0.85rem', textAlign: 'center', textDecoration: 'none' }}>webcal 열기</a>
            </div>
            <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.78rem' }}>이 URL을 셀원들에게 공유하면 Google 캘린더 <strong style={{ color: 'var(--color-ink)', fontWeight: 700 }}>다른 캘린더 → URL로 추가</strong>에서 한 번 구독 후 일정이 자동 동기화됩니다.</p>
          </div>
        </section>
      )}
    </div>
  );
};

export default ScheduleView;
