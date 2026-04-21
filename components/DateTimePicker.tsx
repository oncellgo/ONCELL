import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string; // 'YYYY-MM-DDTHH:mm'
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
  dateOnly?: boolean; // true면 시간 선택 UI 숨김 및 표시도 날짜만
};

const pad = (n: number) => String(n).padStart(2, '0');

const parseValue = (v: string): { y: number; m: number; d: number; hh: number; mm: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]), hh: Number(match[4]), mm: Number(match[5]) };
};

const DateTimePicker = ({ value, onChange, placeholder, style, buttonStyle, dateOnly = false }: Props) => {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const initial = parseValue(value);
  const today = new Date();
  const [viewYear, setViewYear] = useState(initial?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState((initial?.m ?? today.getMonth() + 1) - 1);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!open) return;
    // 데스크톱에서 오른쪽 넘침 방지: 버튼 위치 기준으로 드롭다운이 뷰포트를 벗어나면 우측 정렬
    if (!isMobile && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const popupWidth = 360;
      setAlignRight(rect.left + popupWidth > window.innerWidth - 8);
    }
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, isMobile]);

  useEffect(() => {
    const p = parseValue(value);
    if (p) { setViewYear(p.y); setViewMonth(p.m - 1); }
  }, [value]);

  const first = new Date(viewYear, viewMonth, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const cur = parseValue(value);
  const selectDate = (d: number) => {
    const hh = cur?.hh ?? 9;
    const mm = cur?.mm ?? 0;
    onChange(`${viewYear}-${pad(viewMonth + 1)}-${pad(d)}T${pad(hh)}:${pad(mm)}`);
  };
  const setHour = (h: number) => {
    if (!cur) return;
    onChange(`${cur.y}-${pad(cur.m)}-${pad(cur.d)}T${pad(h)}:${pad(cur.mm)}`);
  };
  const setMinute = (m: number) => {
    if (!cur) return;
    onChange(`${cur.y}-${pad(cur.m)}-${pad(cur.d)}T${pad(cur.hh)}:${pad(m)}`);
  };

  const formatAmPm = (hh: number, mm: number) => {
    const ampm = hh < 12 ? '오전' : '오후';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${ampm} ${pad(h12)}:${pad(mm)}`;
  };
  const display = cur
    ? (dateOnly ? `${cur.y}-${pad(cur.m)}-${pad(cur.d)}` : `${cur.y}-${pad(cur.m)}-${pad(cur.d)} ${formatAmPm(cur.hh, cur.mm)}`)
    : '';
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 160, ...style }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: display ? 'var(--color-ink)' : 'var(--color-ink-2)', fontSize: '0.9rem', textAlign: 'left', cursor: 'pointer', ...buttonStyle }}
      >
        {display || placeholder || '날짜·시간 선택'}
      </button>
      {open && isMobile && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div style={{ width: '100%', maxWidth: 420, margin: '0 0.5rem 0.5rem', padding: '0.85rem 0.9rem', background: '#fff', borderRadius: 16, boxShadow: '0 -8px 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else { setViewMonth(viewMonth - 1); } }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-ink-2)', fontSize: '1.1rem', padding: '0.35rem 0.6rem' }}>‹</button>
                <strong style={{ fontSize: '0.95rem', color: 'var(--color-ink)' }}>{viewYear}년 {viewMonth + 1}월</strong>
                <button type="button" onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else { setViewMonth(viewMonth + 1); } }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-ink-2)', fontSize: '1.1rem', padding: '0.35rem 0.6rem' }}>›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.2rem' }}>
                {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
                  <span key={w} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--color-ink-2)' }}>{w}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.2rem' }}>
                {cells.map((d, idx) => {
                  if (!d) return <span key={idx} />;
                  const dow = (startOffset + d - 1) % 7;
                  const cellKey = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
                  const isSelected = cur && cur.y === viewYear && cur.m === viewMonth + 1 && cur.d === d;
                  const isToday = cellKey === todayKey;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectDate(d)}
                      style={{
                        position: 'relative',
                        height: 36,
                        borderRadius: 8,
                        border: isToday && !isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                        background: isSelected ? 'var(--color-primary)' : 'transparent',
                        color: isSelected ? '#fff' : dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink)',
                        fontSize: '0.88rem',
                        fontWeight: isSelected || isToday ? 800 : 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {d}
                      {isToday && <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', fontSize: '0.54rem', fontWeight: 800, color: isSelected ? '#fff' : 'var(--color-primary-deep)', lineHeight: 1 }}>오늘</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {dateOnly ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-surface-border)', paddingTop: '0.65rem' }}>
                <button type="button" onClick={() => setOpen(false)} style={{ padding: '0.55rem 0.9rem', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}>완료</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid var(--color-surface-border)', paddingTop: '0.65rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>시간</span>
                <select value={cur?.hh ?? 9} onChange={(e) => setHour(Number(e.target.value))} style={{ flex: 1, padding: '0.5rem 0.5rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.9rem' }}>
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{pad(h)}</option>)}
                </select>
                <span style={{ color: 'var(--color-ink-2)' }}>:</span>
                <select value={cur?.mm ?? 0} onChange={(e) => setMinute(Number(e.target.value))} style={{ flex: 1, padding: '0.5rem 0.5rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.9rem' }}>
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => <option key={m} value={m}>{pad(m)}</option>)}
                </select>
                <button type="button" onClick={() => setOpen(false)} style={{ padding: '0.55rem 0.9rem', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}>완료</button>
              </div>
            )}
          </div>
        </div>
      )}
      {open && !isMobile && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', ...(alignRight ? { right: 0 } : { left: 0 }), zIndex: 50, padding: '0.65rem 0.75rem', background: '#fff', border: '1px solid var(--color-gray)', borderRadius: 12, boxShadow: 'var(--shadow-card)', display: 'flex', gap: '0.75rem', minWidth: 340 }}>
          <div style={{ display: 'grid', gap: '0.5rem', minWidth: 240 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else { setViewMonth(viewMonth - 1); } }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-ink-2)', fontSize: '0.95rem', padding: '0.2rem 0.4rem' }}>‹</button>
              <strong style={{ fontSize: '0.88rem', color: 'var(--color-ink)' }}>{viewYear}년 {viewMonth + 1}월</strong>
              <button type="button" onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else { setViewMonth(viewMonth + 1); } }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-ink-2)', fontSize: '0.95rem', padding: '0.2rem 0.4rem' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.15rem' }}>
              {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
                <span key={w} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : 'var(--color-ink-2)' }}>{w}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.15rem' }}>
              {cells.map((d, idx) => {
                if (!d) return <span key={idx} />;
                const dow = (startOffset + d - 1) % 7;
                const cellKey = `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
                const isSelected = cur && cur.y === viewYear && cur.m === viewMonth + 1 && cur.d === d;
                const isToday = cellKey === todayKey;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectDate(d)}
                    style={{
                      position: 'relative',
                      height: 28,
                      borderRadius: 6,
                      border: isToday && !isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                      background: isSelected ? 'var(--color-primary)' : 'transparent',
                      color: isSelected ? '#fff' : dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : 'var(--color-ink)',
                      fontSize: '0.78rem',
                      fontWeight: isSelected || isToday ? 800 : 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {d}
                    {isToday && <span style={{ position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)', fontSize: '0.48rem', fontWeight: 800, color: isSelected ? '#fff' : 'var(--color-primary-deep)', lineHeight: 1 }}>오늘</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {!dateOnly && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderLeft: '1px solid var(--color-surface-border)', paddingLeft: '0.75rem', minWidth: 90 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-ink-2)', textAlign: 'center' }}>시간</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                <select value={cur?.hh ?? 9} onChange={(e) => setHour(Number(e.target.value))} style={{ padding: '0.35rem 0.4rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem' }}>
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => <option key={h} value={h}>{pad(h)}</option>)}
                </select>
                <span style={{ color: 'var(--color-ink-2)' }}>:</span>
                <select value={cur?.mm ?? 0} onChange={(e) => setMinute(Number(e.target.value))} style={{ padding: '0.35rem 0.4rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem' }}>
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => <option key={m} value={m}>{pad(m)}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => setOpen(false)} style={{ marginTop: 'auto', padding: '0.4rem 0.7rem', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>완료</button>
            </div>
          )}
          {dateOnly && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="button" onClick={() => setOpen(false)} style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>완료</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DateTimePicker;
