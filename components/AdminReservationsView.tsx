import { useEffect, useMemo, useState, CSSProperties } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

type Reservation = {
  id: string;
  communityId: string;
  title: string;
  startAt: string;
  endAt: string;
  location?: string;
  venueId?: string;
  createdBy: string;
  createdByName?: string;
};

type Props = {
  authQS: string;
  authHeaders: Record<string, string>;
  communityId?: string;
  cardStyle: CSSProperties;
  titleStyle: CSSProperties;
  subtle: CSSProperties;
  isMobile?: boolean;
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return { dateKey: `${d.getFullYear()}-${m}-${day}`, mmdd: `${m}/${day}`, dow, hm: `${hh}:${mm}` };
};

const AdminReservationsView = ({ authQS, authHeaders, communityId = 'kcis', cardStyle, titleStyle, subtle, isMobile }: Props) => {
  const mobile = useIsMobile();
  const isMob = isMobile ?? mobile;
  const [items, setItems] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<'date' | 'user'>('date');
  const [filterText, setFilterText] = useState('');
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/reservations?${authQS}&communityId=${encodeURIComponent(communityId)}`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setItems((d?.reservations || []) as Reservation[]);
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authQS, communityId]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let arr = (items || []).slice();
    if (!showPast) arr = arr.filter((r) => new Date(r.endAt).getTime() >= now);
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      arr = arr.filter((r) =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.location || '').toLowerCase().includes(q) ||
        (r.createdBy || '').toLowerCase().includes(q) ||
        (r.createdByName || '').toLowerCase().includes(q)
      );
    }
    arr.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return arr;
  }, [items, filterText, showPast]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of filtered) {
      const k = fmt(r.startAt).dateKey;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const groupedByUser = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of filtered) {
      const k = r.createdBy || '(unknown)';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <section style={{ ...cardStyle, padding: isMob ? '0.85rem' : cardStyle.padding }}>
      <h2 style={titleStyle}>예약 상황</h2>
      <p style={subtle}>모든 사용자의 장소 예약 내역. 날짜별 또는 사용자(ID)별로 그룹화하여 조회.</p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', margin: '0.75rem 0 1rem' }}>
        <div style={{ display: 'inline-flex', borderRadius: 999, background: '#F3F4F6', padding: '0.25rem' }}>
          {(['date', 'user'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              style={{
                padding: '0.4rem 0.9rem', borderRadius: 999, border: 'none',
                background: groupBy === g ? 'var(--color-primary)' : 'transparent',
                color: groupBy === g ? '#fff' : 'var(--color-ink-2)',
                fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
              }}
            >{g === 'date' ? '날짜별' : '사용자별'}</button>
          ))}
        </div>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="제목/장소/이름/ID 검색"
          style={{ flex: '1 1 220px', padding: '0.5rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.88rem' }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
          지난 예약 포함
        </label>
        <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>총 {filtered.length}건</span>
      </div>

      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>표시할 예약이 없습니다.</p>
      ) : groupBy === 'date' ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {groupedByDate.map(([dateKey, arr]) => {
            const f = fmt(arr[0].startAt);
            return (
              <div key={dateKey} style={{ display: 'grid', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.4rem', borderBottom: '2px solid #ECFCCB' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#3F6212' }}>{dateKey} ({f.dow})</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{arr.length}건</span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                  {arr.map((r) => {
                    const s = fmt(r.startAt);
                    const e = fmt(r.endAt);
                    return (
                      <li key={r.id} style={{ display: 'grid', gridTemplateColumns: isMob ? '90px 1fr' : '110px 1fr 200px', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.7rem', background: '#F9FCFB', border: '1px solid var(--color-surface-border)', borderRadius: 10, fontSize: '0.86rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{s.hm}~{e.hm}</span>
                        <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
                          <span style={{ fontWeight: 800, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                          {r.location && <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>📍 {r.location}</span>}
                        </div>
                        {!isMob && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.createdByName || '(이름없음)'} <span style={{ opacity: 0.7 }}>· {r.createdBy}</span>
                          </span>
                        )}
                        {isMob && (
                          <span style={{ gridColumn: '1 / -1', fontSize: '0.74rem', color: 'var(--color-ink-2)' }}>👤 {r.createdByName || '(이름없음)'} · {r.createdBy}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {groupedByUser.map(([userId, arr]) => {
            const name = arr.find((x) => x.createdByName)?.createdByName || '(이름없음)';
            return (
              <div key={userId} style={{ display: 'grid', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.4rem', borderBottom: '2px solid #DBEAFE' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1E40AF' }}>👤 {name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-2)' }}>{userId}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{arr.length}건</span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                  {arr.map((r) => {
                    const s = fmt(r.startAt);
                    const e = fmt(r.endAt);
                    return (
                      <li key={r.id} style={{ display: 'grid', gridTemplateColumns: isMob ? '85px 1fr' : '120px 60px 1fr', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.7rem', background: '#F9FCFB', border: '1px solid var(--color-surface-border)', borderRadius: 10, fontSize: '0.86rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}>{s.dateKey.slice(5)} ({s.dow})</span>
                        {!isMob && <span style={{ color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{s.hm}~{e.hm}</span>}
                        <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                          {r.location && <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>📍 {r.location}{isMob ? ` · ${s.hm}~${e.hm}` : ''}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default AdminReservationsView;
