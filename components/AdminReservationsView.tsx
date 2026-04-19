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
  const [groupBy, setGroupBy] = useState<'date' | 'venue' | 'user'>('date');
  const [filterText, setFilterText] = useState('');
  const [venueFilter, setVenueFilter] = useState<string>('');     // location 부분일치
  const [userFilter, setUserFilter] = useState<string>('');       // createdBy 또는 이름 부분일치
  const [dateFilter, setDateFilter] = useState<string>('');       // YYYY-MM-DD 정확 매치
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

  // 모든 고유 장소·사용자 (드롭다운 옵션용)
  const venueOptions = useMemo(() => {
    const set = new Set<string>();
    (items || []).forEach((r) => { if (r.location) set.add(r.location); });
    return Array.from(set).sort();
  }, [items]);
  const userOptions = useMemo(() => {
    const map = new Map<string, string>(); // key=createdBy, label="이름 (id)"
    (items || []).forEach((r) => {
      const label = r.createdByName ? `${r.createdByName} (${r.createdBy})` : r.createdBy;
      map.set(r.createdBy, label);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let arr = (items || []).slice();
    if (!showPast) arr = arr.filter((r) => new Date(r.endAt).getTime() >= now);
    if (venueFilter) arr = arr.filter((r) => (r.location || '') === venueFilter);
    if (userFilter) arr = arr.filter((r) => r.createdBy === userFilter);
    if (dateFilter) arr = arr.filter((r) => fmt(r.startAt).dateKey === dateFilter);
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
  }, [items, filterText, venueFilter, userFilter, dateFilter, showPast]);

  const groupedByVenue = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of filtered) {
      const k = r.location || '(미지정)';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

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

      <div style={{ display: 'grid', gap: '0.6rem', margin: '0.75rem 0 1rem' }}>
        {/* 1행: 그룹 토글 + 통합 검색 + 지난예약 포함 + 카운트 */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', borderRadius: 999, background: '#F3F4F6', padding: '0.25rem', flexShrink: 0 }}>
            {(['date', 'venue', 'user'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                style={{
                  padding: '0.4rem 0.85rem', borderRadius: 999, border: 'none',
                  background: groupBy === g ? 'var(--color-primary)' : 'transparent',
                  color: groupBy === g ? '#fff' : 'var(--color-ink-2)',
                  fontWeight: 800, fontSize: '0.84rem', cursor: 'pointer',
                }}
              >{g === 'date' ? '날짜별' : g === 'venue' ? '장소별' : '예약자별'}</button>
            ))}
          </div>
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="제목/장소/이름/ID 통합 검색"
            style={{ flex: '1 1 200px', padding: '0.5rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.88rem' }}
          />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-ink-2)', cursor: 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
            지난 예약 포함
          </label>
          <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>총 {filtered.length}건</span>
        </div>

        {/* 2행: 장소·예약자·날짜 정확 매치 필터 */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={venueFilter}
            onChange={(e) => setVenueFilter(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem', background: '#fff', flex: '1 1 180px', maxWidth: 280 }}
          >
            <option value="">📍 장소 (전체)</option>
            {venueOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem', background: '#fff', flex: '1 1 180px', maxWidth: 280 }}
          >
            <option value="">👤 예약자 (전체)</option>
            {userOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.85rem', flex: '0 1 160px' }}
          />
          {(venueFilter || userFilter || dateFilter) && (
            <button
              type="button"
              onClick={() => { setVenueFilter(''); setUserFilter(''); setDateFilter(''); }}
              style={{ padding: '0.4rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
            >초기화</button>
          )}
        </div>
      </div>

      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>표시할 예약이 없습니다.</p>
      ) : groupBy === 'venue' ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {groupedByVenue.map(([venue, arr]) => (
            <div key={venue} style={{ display: 'grid', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.4rem', borderBottom: '2px solid #FEF3C7' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#92400E' }}>📍 {venue}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{arr.length}건</span>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                {arr.map((r) => {
                  const s = fmt(r.startAt);
                  const e = fmt(r.endAt);
                  return (
                    <li key={r.id} style={{ display: 'grid', gridTemplateColumns: isMob ? '90px 1fr' : '110px 80px 1fr 200px', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.7rem', background: '#F9FCFB', border: '1px solid var(--color-surface-border)', borderRadius: 10, fontSize: '0.86rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}>{s.dateKey.slice(5)} ({s.dow})</span>
                      {!isMob && <span style={{ color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{s.hm}~{e.hm}</span>}
                      <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                        {isMob && <span style={{ fontSize: '0.74rem', color: 'var(--color-ink-2)' }}>{s.hm}~{e.hm} · 👤 {r.createdByName || '(이름없음)'}</span>}
                      </div>
                      {!isMob && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.createdByName || '(이름없음)'} <span style={{ opacity: 0.7 }}>· {r.createdBy}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
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
