import { useEffect, useState } from 'react';

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
  const [calCommunityId, setCalCommunityId] = useState(defaultCommunityId);
  const [calView, setCalView] = useState<{ year: number; month: number } | null>(null);
  const [calSlideDir, setCalSlideDir] = useState<'left' | 'right' | null>(null);
  const [selectedCalDay, setSelectedCalDay] = useState<string | null>(null);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [scheduleTab, setScheduleTab] = useState<'week' | 'month'>('week');

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
      <section style={{
        padding: '1.1rem 1.25rem',
        borderRadius: 16,
        background: 'linear-gradient(135deg, #ECFCCB 0%, #D9F09E 100%)',
        border: '1px solid #D9F09E',
        boxShadow: 'var(--shadow-card)',
        display: 'grid',
        gap: '0.65rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.05rem' }}>⛪</span>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#3F6212', letterSpacing: '-0.01em' }}>예배 일정</h2>
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 700, color: '#65A30D' }}>향후 2주</span>
        </div>
        {worshipUpcoming.length === 0 ? (
          <p style={{ margin: 0, color: '#65A30D', fontSize: '0.88rem' }}>예정된 예배일정이 없습니다.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
            {worshipUpcoming.map((w) => {
              const d = new Date(w.startAt);
              const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
              const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}(${dow})`;
              const timeStr = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
              return (
                <li key={w.id + w.startAt} style={{ display: 'grid', gridTemplateColumns: '95px 70px 1fr', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>
                  <span style={{ color: '#3F6212', fontWeight: 800, whiteSpace: 'nowrap' }}>{dateStr}</span>
                  <span style={{ color: '#65A30D', fontWeight: 700, whiteSpace: 'nowrap' }}>{timeStr}</span>
                  <span style={{ color: 'var(--color-ink)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div role="tablist" style={{ display: 'flex', gap: '0', marginBottom: -1, position: 'relative', zIndex: 2 }}>
        {([
          { key: 'week', label: '주단위 일정' },
          { key: 'month', label: '월단위 일정' },
        ] as const).map((t) => {
          const active = scheduleTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setScheduleTab(t.key)}
              style={{
                padding: '0.7rem 1.4rem',
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottomLeftRadius: 0,
                borderBottomRightRadius: 0,
                border: active ? '1px solid var(--color-surface-border)' : '1px solid var(--color-primary)',
                borderBottom: active ? '1px solid var(--color-surface)' : '1px solid var(--color-primary)',
                background: active ? 'var(--color-surface)' : 'var(--color-primary)',
                color: active ? 'var(--color-ink)' : '#fff',
                fontSize: '0.95rem',
                fontWeight: active ? 800 : 600,
                cursor: 'pointer',
                letterSpacing: '-0.01em',
                transition: 'background 0.15s ease, color 0.15s ease',
                marginRight: 2,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {scheduleTab === 'week' && (
      <section style={{ padding: '1.5rem', borderTopLeftRadius: 0, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>주단위 일정</h2>
          <span style={{ color: 'var(--color-ink)', fontSize: '0.92rem', fontWeight: 500 }}>{weekRangeLabel}</span>
        </div>
        {totalWeekEvents === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>이번 주에 등록된 일정이 없습니다.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {weekDays.filter((d) => d.events.length > 0).map((day) => {
              const dow = ['일', '월', '화', '수', '목', '금', '토'][day.date.getDay()];
              const isToday = day.key === todayKey;
              return (
                <div key={day.key} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 10, background: isToday ? 'var(--color-primary-tint)' : '#F9FCFB', border: `1px solid ${isToday ? 'var(--color-primary)' : 'var(--color-surface-border)'}` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isToday ? 'var(--color-primary-deep)' : day.date.getDay() === 0 ? '#dc2626' : day.date.getDay() === 6 ? '#2563eb' : 'var(--color-ink-2)' }}>{dow}요일</span>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: isToday ? 'var(--color-primary-deep)' : 'var(--color-ink)', lineHeight: 1 }}>{day.date.getMonth() + 1}.{day.date.getDate()}</span>
                    {isToday && <span style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--color-primary-deep)' }}>오늘</span>}
                  </div>
                  <div style={{ display: 'grid', gap: '0.3rem' }}>
                    {day.events.map((ev) => {
                      const scopeLabel = (ev as any).scope === 'worship' ? '⛪ 예배' : ev.scope === 'community' ? '' : '개인';
                      const scopeColor = (ev as any).scope === 'worship' ? '#20CD8D' : ev.scope === 'community' ? '#1E40AF' : '#92400E';
                      const timeLabel = new Date(ev.startAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '60px 60px 1fr', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                          <span style={{ color: scopeColor, fontWeight: 700, fontSize: '0.74rem', whiteSpace: 'nowrap' }}>{scopeLabel}</span>
                          <span style={{ color: 'var(--color-ink-2)', fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{timeLabel}</span>
                          <span style={{ fontWeight: 700, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {scheduleTab === 'month' && (
      <section style={{ padding: '1.5rem', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>월단위 일정</h2>
            {addEventHref && (
              <a
                href={addEventHref}
                style={{ padding: '0.35rem 0.8rem', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: '0.82rem', fontWeight: 800, textDecoration: 'none', boxShadow: 'var(--shadow-button)', whiteSpace: 'nowrap' }}
              >
                + 일정추가
              </a>
            )}
          </div>
          <span style={{ color: 'var(--color-ink)', fontSize: '0.92rem', fontWeight: 500 }}>{panelKey.replace(/-/g, '.')} ({dowLabel}){panelKey === todayKey ? ' · 오늘' : ''}</span>
        </div>
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
                  <button type="button" onClick={() => setYearPickerOpen((v) => !v)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-ink)', fontSize: '0.82rem', fontWeight: 700, padding: '0.1rem 0.3rem' }}>{year}년 ▾</button>
                  <button type="button" onClick={() => { const [y, m] = todayKey.split('-'); setCalView({ year: Number(y), month: Number(m) }); setSelectedCalDay(todayKey); setYearPickerOpen(false); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-primary-deep)', fontSize: '0.72rem', fontWeight: 700, padding: '0.1rem 0.3rem', textDecoration: 'underline' }}>오늘</button>
                  {yearPickerOpen && (
                    <>
                      <div onClick={() => setYearPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                      <ul style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 40, margin: 0, padding: '0.25rem', listStyle: 'none', background: '#fff', border: '1px solid var(--color-gray)', borderRadius: 8, boxShadow: 'var(--shadow-card)', maxHeight: 200, overflowY: 'auto', minWidth: 80 }}>
                        {yearOptions.map((y) => (
                          <li key={y}>
                            <button type="button" onClick={() => { setCalView({ year: y, month: monthIdx + 1 }); setYearPickerOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '0.35rem 0.6rem', border: 'none', background: y === year ? 'var(--color-primary-tint)' : 'transparent', color: 'var(--color-ink)', fontWeight: y === year ? 800 : 600, fontSize: '0.8rem', cursor: 'pointer', borderRadius: 6 }}>{y}</button>
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
                  const ds = eventsByDay.get(key) || [];
                  const hasEvent = ds.length > 0;
                  const worshipEvent = ds.find((e: any) => e.scope === 'worship');
                  const hasWorship = !!worshipEvent;
                  const isToday = key === todayKey;
                  const isSelected = selectedCalDay === key;
                  const dow = d.getDay();
                  return (
                    <button key={idx} type="button" onClick={() => setSelectedCalDay(isSelected ? null : key)} title={hasEvent ? ds.map((e) => e.title).join(', ') : ''}
                      style={{ minHeight: hasWorship ? 64 : 44, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 8, background: isSelected ? 'var(--color-primary)' : hasWorship ? '#DBEAFE' : isToday ? 'var(--color-primary-tint)' : hasEvent ? '#f0fdf4' : 'transparent', border: isSelected ? '1px solid var(--color-primary)' : hasWorship ? '1.5px solid #2563eb' : isToday ? '1px solid var(--color-primary)' : hasEvent ? '1px solid #bbf7d0' : '1px solid transparent', fontSize: '0.74rem', color: isSelected ? '#ffffff' : hasWorship ? '#1E3A8A' : dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink)', fontWeight: isToday || isSelected || hasWorship ? 800 : 600, cursor: 'pointer', padding: '2px 0', overflow: 'hidden' }}>
                      <span style={{ lineHeight: 1 }}>{d.getDate()}</span>
                      {hasWorship && !isSelected && (<span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1E40AF', lineHeight: 1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>⛪ {worshipEvent!.title}</span>)}
                      {hasEvent && !hasWorship && !isSelected && <span style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--color-primary)' }} />}
                    </button>
                  );
                })}
              </div>
              <div style={{ textAlign: 'right', marginTop: '0.2rem' }}><span style={{ fontSize: '0.6rem', color: 'var(--color-ink-2)', fontWeight: 500 }}>{communityTz}</span></div>
            </div>
            <button type="button" onClick={goNext} aria-label="다음 달" style={{ flex: '0 0 auto', width: 40, borderRadius: 12, border: '1px solid var(--color-surface-border)', background: '#F9FCFB', color: 'var(--color-ink-2)', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>›</button>
          </div>
          <div style={{ padding: '0.75rem 1rem', borderRadius: 12, background: '#ffffff', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-ink)', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-surface-border)' }}>📅 {dateLabel}</div>
            {dayEvents.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.85rem' }}>등록된 일정이 없습니다.</p>
            ) : (
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                {dayEvents.map((ev) => {
                  const scopeLabel = (ev as any).scope === 'worship' ? '⛪ 예배' : ev.scope === 'community' ? '' : (ev.createdByName || '개인');
                  const scopeColor = (ev as any).scope === 'worship' ? '#20CD8D' : ev.scope === 'community' ? '#1E40AF' : '#92400E';
                  const timeLabel = new Date(ev.startAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={ev.id} style={{ display: 'grid', gridTemplateColumns: '72px 60px 1fr', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.6rem', borderRadius: 8, background: '#F9FCFB', border: '1px solid var(--color-surface-border)', fontSize: '0.85rem' }}>
                      <span style={{ color: scopeColor, fontWeight: 700, fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{scopeLabel}</span>
                      <span style={{ color: 'var(--color-ink-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{timeLabel}</span>
                      <span style={{ fontWeight: 700, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
      )}
      </div>

      {showIcsSubscription && icsUrl && (
        <section style={{ padding: '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>Google 캘린더 구독</h2>
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
