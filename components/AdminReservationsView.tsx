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
  const [filterText, setFilterText] = useState('');
  const [venueFilter, setVenueFilter] = useState<string>(''); // '' = 전체
  const [userFilter, setUserFilter] = useState<string>('');   // '' = 전체
  const [dateMode, setDateMode] = useState<'future' | 'past' | 'custom'>('future');
  const [customDate, setCustomDate] = useState<string>('');
  const [editTarget, setEditTarget] = useState<Reservation | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; date: string; startTime: string; endTime: string; location: string }>({ title: '', date: '', startTime: '', endTime: '', location: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    fetch(`/api/admin/reservations?${authQS}&communityId=${encodeURIComponent(communityId)}`, { headers: authHeaders })
      .then((r) => r.json())
      .then((d) => setItems((d?.reservations || []) as Reservation[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authQS, communityId]);

  const openEdit = (r: Reservation) => {
    const s = new Date(r.startAt);
    const e = new Date(r.endAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    setEditTarget(r);
    setEditError(null);
    setEditForm({
      title: r.title,
      date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
      startTime: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
      endTime: `${pad(e.getHours())}:${pad(e.getMinutes())}`,
      location: r.location || '',
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true); setEditError(null);
    try {
      const [y, m, d] = editForm.date.split('-').map(Number);
      const [sh, sm] = editForm.startTime.split(':').map(Number);
      const [eh, em] = editForm.endTime.split(':').map(Number);
      const startAt = new Date(y, m - 1, d, sh, sm).toISOString();
      const endAt = new Date(y, m - 1, d, eh, em).toISOString();
      const r = await fetch(`/api/admin/reservations?${authQS}`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editTarget.id, title: editForm.title, startAt, endAt, location: editForm.location }),
      });
      const j = await r.json();
      if (!r.ok) { setEditError(j.error || '수정 실패'); return; }
      setEditTarget(null);
      reload();
    } catch {
      setEditError('수정 중 오류가 발생했습니다.');
    } finally {
      setEditSaving(false);
    }
  };

  const deleteReservation = async (r: Reservation) => {
    if (!confirm(`"${r.title}" 예약을 삭제하시겠습니까?\n${r.location || ''}\n${new Date(r.startAt).toLocaleString('ko-KR')}`)) return;
    try {
      const res = await fetch(`/api/admin/reservations?${authQS}&id=${encodeURIComponent(r.id)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || '삭제 실패'); return; }
      reload();
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 드롭다운 옵션 자동 생성
  const venueOptions = useMemo(() => {
    const set = new Set<string>();
    (items || []).forEach((r) => { if (r.location) set.add(r.location); });
    return Array.from(set).sort();
  }, [items]);
  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    (items || []).forEach((r) => {
      const label = r.createdByName ? `${r.createdByName} (${r.createdBy})` : r.createdBy;
      map.set(r.createdBy, label);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const filtered = useMemo(() => {
    const now = Date.now();
    let arr = (items || []).slice();

    // 날짜 모드
    if (dateMode === 'future') {
      arr = arr.filter((r) => new Date(r.endAt).getTime() >= now);
    } else if (dateMode === 'past') {
      arr = arr.filter((r) => new Date(r.endAt).getTime() < now);
    } else if (dateMode === 'custom' && customDate) {
      arr = arr.filter((r) => fmt(r.startAt).dateKey === customDate);
    }

    if (venueFilter) arr = arr.filter((r) => (r.location || '') === venueFilter);
    if (userFilter) arr = arr.filter((r) => r.createdBy === userFilter);

    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      arr = arr.filter((r) =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.location || '').toLowerCase().includes(q) ||
        (r.createdBy || '').toLowerCase().includes(q) ||
        (r.createdByName || '').toLowerCase().includes(q)
      );
    }

    arr.sort((a, b) => dateMode === 'past' ? b.startAt.localeCompare(a.startAt) : a.startAt.localeCompare(b.startAt));
    return arr;
  }, [items, filterText, venueFilter, userFilter, dateMode, customDate]);

  return (
    <section style={{ ...cardStyle, padding: isMob ? '0.85rem' : cardStyle.padding }}>
      <h2 style={titleStyle}>예약 상황</h2>
      <p style={subtle}>모든 사용자의 장소 예약 내역. 장소·사용자·날짜 별로 검색할 수 있습니다.</p>

      <div style={{ display: 'grid', gap: '0.55rem', margin: '0.75rem 0 1rem' }}>
        {/* 1행: 3개 드롭다운 */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={venueFilter}
            onChange={(e) => setVenueFilter(e.target.value)}
            style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.88rem', background: '#fff', flex: '1 1 180px', maxWidth: 280 }}
          >
            <option value="">📍 장소 (전체)</option>
            {venueOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.88rem', background: '#fff', flex: '1 1 180px', maxWidth: 280 }}
          >
            <option value="">👤 사용자 (전체)</option>
            {userOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select
            value={dateMode}
            onChange={(e) => setDateMode(e.target.value as 'future' | 'past' | 'custom')}
            style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.88rem', background: '#fff', flex: '0 1 180px' }}
          >
            <option value="future">📅 오늘 이후 전체</option>
            <option value="past">⏮️ 어제까지</option>
            <option value="custom">🎯 직접 입력</option>
          </select>
          {dateMode === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.88rem', flex: '0 1 160px' }}
            />
          )}
          <span style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>총 {filtered.length}건</span>
        </div>
        {/* 2행: 통합 텍스트 검색 */}
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="제목/장소/이름/ID 통합 검색"
          style={{ padding: '0.5rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.88rem' }}
        />
      </div>

      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>표시할 예약이 없습니다.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
          {filtered.map((r) => {
            const s = fmt(r.startAt);
            const e = fmt(r.endAt);
            return (
              <li key={r.id} style={{
                display: 'grid',
                gridTemplateColumns: isMob ? '1fr auto' : '120px 90px 1fr 200px auto',
                alignItems: 'center', gap: '0.6rem',
                padding: '0.65rem 0.8rem', background: '#F9FCFB',
                border: '1px solid var(--color-surface-border)', borderRadius: 10, fontSize: '0.86rem',
              }}>
                {!isMob ? (
                  <>
                    <span style={{ fontWeight: 800, color: 'var(--color-ink)', whiteSpace: 'nowrap' }}>
                      {s.dateKey.slice(5)} ({s.dow})
                    </span>
                    <span style={{ color: 'var(--color-ink-2)', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.hm}~{e.hm}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                      {r.location && <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>📍 {r.location}</div>}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.createdByName || '(이름없음)'} <span style={{ opacity: 0.7 }}>· {r.createdBy}</span>
                    </span>
                  </>
                ) : (
                  <div style={{ display: 'grid', gap: '0.2rem', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: 'var(--color-ink)' }}>{s.dateKey.slice(5)} ({s.dow})</span>
                      <span style={{ color: 'var(--color-ink-2)' }}>{s.hm}~{e.hm}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{r.title}</div>
                    {r.location && <div style={{ fontSize: '0.76rem', color: 'var(--color-ink-2)' }}>📍 {r.location}</div>}
                    <div style={{ fontSize: '0.74rem', color: 'var(--color-ink-2)' }}>👤 {r.createdByName || '(이름없음)'} · {r.createdBy}</div>
                  </div>
                )}
                <div style={{ display: 'inline-flex', gap: '0.3rem', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: '1px solid #20CD8D', background: '#fff', color: '#20CD8D', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >수정</button>
                  <button
                    type="button"
                    onClick={() => deleteReservation(r)}
                    style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >삭제</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 수정 모달 */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setEditTarget(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 1000 }}
        >
          <div className="modal-card" style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16, padding: '1.25rem', display: 'grid', gap: '0.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-ink)' }}>예약 수정</h3>
              <button type="button" onClick={() => setEditTarget(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-ink-2)' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)' }}>예약자: {editTarget.createdByName || '(이름없음)'} · {editTarget.createdBy}</div>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>제목</span>
              <input type="text" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.92rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>장소</span>
              <input type="text" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.92rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>날짜</span>
              <input type="date" value={editForm.date} onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.92rem' }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }} className="stack-on-mobile">
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>시작 시각</span>
                <input type="time" value={editForm.startTime} onChange={(e) => setEditForm((f) => ({ ...f, startTime: e.target.value }))}
                  style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.92rem' }} />
              </label>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>종료 시각</span>
                <input type="time" value={editForm.endTime} onChange={(e) => setEditForm((f) => ({ ...f, endTime: e.target.value }))}
                  style={{ padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.92rem' }} />
              </label>
            </div>
            {editError && <div style={{ fontSize: '0.82rem', color: '#B91C1C', fontWeight: 700 }}>{editError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button type="button" onClick={() => setEditTarget(null)}
                style={{ padding: '0.55rem 1rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', cursor: 'pointer', fontWeight: 700 }}
              >취소</button>
              <button type="button" onClick={saveEdit} disabled={editSaving}
                style={{ padding: '0.55rem 1.2rem', borderRadius: 8, border: 'none', background: editSaving ? '#A7F3D0' : '#20CD8D', color: '#fff', cursor: editSaving ? 'wait' : 'pointer', fontWeight: 800 }}
              >{editSaving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminReservationsView;
