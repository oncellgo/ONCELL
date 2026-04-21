import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

type DayStat = { qt: number; reading: number };

type Props = {
  profileId: string;
  k: string;
  email?: string | null;
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const StatsPanel = ({ profileId, k, email }: Props) => {
  const isMobile = useIsMobile();
  const today = new Date();
  const todayKey = keyOf(today);
  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth() + 1);
  const [days, setDays] = useState<Record<string, DayStat>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'qt' | 'reading'>('qt');

  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}${email ? `&email=${encodeURIComponent(email)}` : ''}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    fetch(`/api/admin/stats?year=${viewYear}&month=${viewMonth}&${authQS}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.error) setErr(d.error);
        else setDays(d?.days || {});
      })
      .catch(() => { if (!cancelled) setErr('로드 실패'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [viewYear, viewMonth, authQS]);

  const goPrev = () => {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); }
    else setViewMonth(viewMonth - 1);
  };
  const goNext = () => {
    const isCurrent = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;
    if (isCurrent) return;
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); }
    else setViewMonth(viewMonth + 1);
  };
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth() + 1;

  // 달력 그리드 — 해당 월 1일 앞에 공백 셀, 마지막 주 뒤에 공백
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay();
  const lastDay = new Date(viewYear, viewMonth, 0).getDate();
  const grid: Array<{ key: string; day: number } | null> = [];
  for (let i = 0; i < firstDow; i++) grid.push(null);
  for (let d = 1; d <= lastDay; d++) grid.push({ key: `${viewYear}-${pad(viewMonth)}-${pad(d)}`, day: d });
  while (grid.length % 7 !== 0) grid.push(null);

  // 월간 합계 (오늘까지만)
  let qtTotal = 0; let readingTotal = 0;
  for (const key of Object.keys(days)) {
    if (key > todayKey) continue;
    qtTotal += days[key].qt;
    readingTotal += days[key].reading;
  }

  return (
    <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-ink)' }}>큐티 / 통독 관리</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>일별 완료자 수 (오늘까지 기준 월간 합계: <strong style={{ color: '#3F6212' }}>큐티 {qtTotal}</strong> · <strong style={{ color: '#1E40AF' }}>통독 {readingTotal}</strong>)</span>
      </div>

      {/* tab: QT | reading */}
      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
        {(['qt', 'reading'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '0.4rem 0.9rem',
              borderRadius: 999,
              border: tab === t ? '1px solid #65A30D' : '1px solid var(--color-gray)',
              background: tab === t ? '#ECFCCB' : '#fff',
              color: tab === t ? '#3F6212' : 'var(--color-ink-2)',
              fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
            }}
          >{t === 'qt' ? '큐티 완료자' : '통독 완료자'}</button>
        ))}
      </div>

      {/* 월 네비 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
        <button type="button" onClick={goPrev} style={{ padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 800, cursor: 'pointer' }}>‹ 이전 달</button>
        <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-ink)', minWidth: 120, textAlign: 'center' }}>{viewYear}년 {viewMonth}월</span>
        <button type="button" onClick={goNext} disabled={isCurrentMonth} style={{ padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: isCurrentMonth ? '#F3F4F6' : '#fff', color: isCurrentMonth ? '#9CA3AF' : 'var(--color-ink-2)', fontWeight: 800, cursor: isCurrentMonth ? 'not-allowed' : 'pointer', opacity: isCurrentMonth ? 0.55 : 1 }}>다음 달 ›</button>
      </div>

      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>불러오는 중…</p>
      ) : err ? (
        <p style={{ margin: 0, color: '#B91C1C', fontSize: '0.9rem' }}>{err}</p>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem', marginBottom: '0.4rem' }}>
            {DAY_LABELS.map((l, i) => (
              <div key={l} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, color: i === 0 ? '#DC2626' : i === 6 ? '#2563EB' : 'var(--color-ink-2)' }}>{l}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.35rem' }}>
            {grid.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const stat = days[cell.key] || { qt: 0, reading: 0 };
              const count = tab === 'qt' ? stat.qt : stat.reading;
              const isFuture = cell.key > todayKey;
              const isToday = cell.key === todayKey;
              const dow = new Date(cell.key).getDay();
              const dowColor = dow === 0 ? '#DC2626' : dow === 6 ? '#2563EB' : 'var(--color-ink-2)';
              const hasData = !isFuture && count > 0;
              return (
                <div
                  key={i}
                  style={{
                    padding: isMobile ? '0.35rem 0.2rem' : '0.5rem 0.3rem',
                    minHeight: isMobile ? 52 : 68,
                    borderRadius: 8,
                    border: isToday ? '2px solid #20CD8D' : '1px solid var(--color-surface-border)',
                    background: isFuture ? '#F9FAFB' : hasData ? (tab === 'qt' ? '#F7FEE7' : '#EFF6FF') : '#fff',
                    display: 'grid',
                    gap: '0.15rem',
                    textAlign: 'center',
                    opacity: isFuture ? 0.45 : 1,
                  }}
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', fontSize: '0.72rem', fontWeight: 700, color: isFuture ? '#9CA3AF' : dowColor }}>
                    <span>{cell.day}</span>
                    {isToday && <span style={{ fontSize: '0.58rem', fontWeight: 800, color: '#fff', background: '#20CD8D', padding: '0.04rem 0.3rem', borderRadius: 999 }}>오늘</span>}
                  </div>
                  {!isFuture && (
                    <div style={{ fontSize: isMobile ? '0.95rem' : '1.1rem', fontWeight: 800, color: count > 0 ? (tab === 'qt' ? '#3F6212' : '#1E40AF') : '#D1D5DB' }}>
                      {count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-ink-2)', lineHeight: 1.6 }}>
        ※ 큐티 완료: 해당 날짜에 묵상노트 3항목(느낀점/결단/기도) 중 하나 이상 작성한 사용자 수.
        통독 완료: 해당 날짜에 "통독 완료" 체크한 사용자 수. 미래 날짜는 집계하지 않습니다.
      </p>
    </section>
  );
};

export default StatsPanel;
