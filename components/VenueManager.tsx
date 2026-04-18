import { useEffect, useState } from 'react';
import { Venue, Block, SLOT_MIN, dateKey, toHHMM, toMin } from './VenueGrid';
import { useIsMobile } from '../lib/useIsMobile';

type BlockGroup = {
  id: string;
  venueId: string;
  slots?: Array<{ dow: number; startMin: number }>;
  days?: number[];
  startMin?: number;
  endMin?: number;
  endDate: string | null;
  reason?: string;
  createdAt: string;
};

const expandGroupSlots = (g: BlockGroup, slotMin: number = SLOT_MIN): Array<{ dow: number; startMin: number }> => {
  if (g.slots && g.slots.length > 0) return g.slots;
  const out: Array<{ dow: number; startMin: number }> = [];
  if (g.days && typeof g.startMin === 'number' && typeof g.endMin === 'number') {
    for (const dow of g.days) {
      for (let m = g.startMin; m < g.endMin; m += slotMin) out.push({ dow, startMin: m });
    }
  }
  return out;
};

type Props = {
  profileId: string;
  k: string;
};

const VenueManager = ({ profileId, k }: Props) => {
  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}`;
  const authHeaders = { 'x-profile-id': profileId, 'x-admin-token': k };

  const [venues, setVenues] = useState<Venue[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [groups, setGroups] = useState<BlockGroup[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [slotMin, setSlotMin] = useState<number>(SLOT_MIN);
  const [availableStart, setAvailableStart] = useState<string>('09:00');
  const [availableEnd, setAvailableEnd] = useState<string>('22:00');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(dateKey(new Date()));
  const [newVenueOpen, setNewVenueOpen] = useState(false);
  const [newVenueFloor, setNewVenueFloor] = useState<string>('');
  const [blockModal, setBlockModal] = useState<{ venueId: string } | null>(null);
  const [blockForm, setBlockForm] = useState({ mode: 'until' as 'until' | 'forever', until: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [editingGroup, setEditingGroup] = useState<BlockGroup | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [vRes, bRes, gRes, fRes, sRes] = await Promise.all([
        fetch(`/api/admin/venues?${authQS}`, { headers: authHeaders }),
        fetch(`/api/admin/venue-blocks?${authQS}`, { headers: authHeaders }),
        fetch(`/api/admin/venue-block-groups?${authQS}`, { headers: authHeaders }),
        fetch(`/api/admin/floors`, { headers: authHeaders }),
        fetch(`/api/admin/settings`),
      ]);
      if (vRes.ok) setVenues((await vRes.json()).venues || []);
      if (bRes.ok) setBlocks((await bRes.json()).blocks || []);
      if (gRes.ok) setGroups((await gRes.json()).groups || []);
      if (fRes.ok) setFloors((await fRes.json()).floors || []);
      if (sRes.ok) {
        const s = await sRes.json();
        const v = s?.settings?.venueSlotMin;
        if (v === 30 || v === 60) setSlotMin(v);
        if (typeof s?.settings?.venueAvailableStart === 'string') setAvailableStart(s.settings.venueAvailableStart);
        if (typeof s?.settings?.venueAvailableEnd === 'string') setAvailableEnd(s.settings.venueAvailableEnd);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const submitExtendedBlock = async () => {
    if (!blockModal) return;
    const [y, m, d] = selectedDate.split('-').map(Number);
    const startAt = new Date(y, m - 1, d, 0, 0).toISOString();
    let endAt: string | null = null;
    if (blockForm.mode === 'until') {
      if (!blockForm.until) { alert('종료일을 선택하세요.'); return; }
      const [uy, um, ud] = blockForm.until.split('-').map(Number);
      endAt = new Date(uy, um - 1, ud, 23, 59, 59).toISOString();
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/venue-blocks?${authQS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ venueId: blockModal.venueId, startAt, endAt, reason: blockForm.reason }),
      });
      if (res.ok) {
        const data = await res.json();
        setBlocks((prev) => [...prev, data.block]);
        setBlockModal(null);
        setBlockForm({ mode: 'until', until: '', reason: '' });
      }
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = async (id: string) => {
    if (!confirm('이 블럭을 해제할까요?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/venue-blocks?id=${encodeURIComponent(id)}&${authQS}`, { method: 'DELETE', headers: authHeaders });
      if (res.ok) setBlocks((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setBusy(false);
    }
  };


  const nextCodeForFloor = (floor: string): string => {
    const m = /^(\d+)/.exec(floor);
    const floorNum = m ? Number(m[1]) : 1;
    const base = floorNum * 100;
    const used = new Set(
      venues
        .filter((v) => v.floor === floor)
        .map((v) => Number((v.code.match(/(\d+)/) || [])[1]))
        .filter((n) => !Number.isNaN(n) && n >= base && n < base + 100)
    );
    for (let n = base + 1; n < base + 100; n++) {
      if (!used.has(n)) return String(n);
    }
    return String(base + 1);
  };

  const createVenue = async (v: Omit<Venue, 'id'>) => {
    setBusy(true);
    try {
      const autoCode = v.code && v.code.trim() ? v.code : nextCodeForFloor(v.floor);
      const res = await fetch(`/api/admin/venues?${authQS}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ ...v, code: autoCode }),
      });
      if (res.ok) { await load(); setNewVenueOpen(false); setNewVenueFloor(''); }
    } finally {
      setBusy(false);
    }
  };

  const deleteVenue = async (id: string) => {
    const venue = venues.find((v) => v.id === id);
    const venueLabel = venue ? `'${venue.floor} · ${venue.name}'` : '이 장소';
    const reservationCount = blocks.filter((b) => b.venueId === id).length;
    const msg = reservationCount > 0
      ? `${venueLabel}에 ${reservationCount}건의 예약이 이미 있습니다.\n그래도 삭제하시겠습니까? (해당 예약도 함께 제거됩니다)`
      : `${venueLabel}을(를) 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      if (reservationCount > 0) {
        const venueBlocks = blocks.filter((b) => b.venueId === id);
        await Promise.all(
          venueBlocks.map((b) =>
            fetch(`/api/admin/venue-blocks?id=${encodeURIComponent(b.id)}&${authQS}`, { method: 'DELETE', headers: authHeaders })
          )
        );
      }
      const res = await fetch(`/api/admin/venues?id=${encodeURIComponent(id)}&${authQS}`, { method: 'DELETE', headers: authHeaders });
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <VenueFloorCard
        venues={venues}
        floors={floors}
        onAdd={(floor) => { setNewVenueFloor(floor); setNewVenueOpen(true); }}
        onDelete={deleteVenue}
        onAddFloor={async (label) => {
          const res = await fetch(`/api/admin/floors?${authQS}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ floor: label }),
          });
          if (res.ok) {
            const d = await res.json();
            setFloors(d.floors || []);
          } else {
            const err = await res.json().catch(() => ({}));
            alert(err.error || '층 추가 실패');
          }
        }}
      />

      <WeeklyBlockCard
        venues={venues}
        slotMin={slotMin}
        availableStart={availableStart}
        availableEnd={availableEnd}
        editingGroup={editingGroup}
        onCancelEdit={() => setEditingGroup(null)}
        onCreateBlocks={async (list) => {
          setBusy(true);
          try {
            for (const item of list) {
              await fetch(`/api/admin/venue-block-groups?${authQS}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify(item),
              });
            }
            await load();
          } finally {
            setBusy(false);
          }
        }}
        onUpdateGroup={async (payload) => {
          setBusy(true);
          try {
            await fetch(`/api/admin/venue-block-groups?${authQS}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify(payload),
            });
            setEditingGroup(null);
            await load();
          } finally {
            setBusy(false);
          }
        }}
        busy={busy}
      />

      <BlockGroupsCard
        groups={groups}
        venues={venues}
        onEdit={(g) => setEditingGroup(g)}
        onDelete={async (id) => {
          if (!confirm('이 반복 블럭을 삭제하시겠습니까? (연결된 모든 시간 블럭이 함께 제거됩니다)')) return;
          setBusy(true);
          try {
            await fetch(`/api/admin/venue-block-groups?id=${encodeURIComponent(id)}&${authQS}`, { method: 'DELETE', headers: authHeaders });
            await load();
          } finally { setBusy(false); }
        }}
      />



      {newVenueOpen && (
        <Modal onClose={() => { setNewVenueOpen(false); setNewVenueFloor(''); }} title="장소 추가">
          <VenueForm initial={newVenueFloor ? { floor: newVenueFloor } : undefined} onSubmit={createVenue} onCancel={() => { setNewVenueOpen(false); setNewVenueFloor(''); }} />
        </Modal>
      )}

      {blockModal && (
        <Modal onClose={() => setBlockModal(null)} title="장기 블럭 추가">
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <input type="radio" checked={blockForm.mode === 'until'} onChange={() => setBlockForm({ ...blockForm, mode: 'until' })} />
                ~까지
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <input type="radio" checked={blockForm.mode === 'forever'} onChange={() => setBlockForm({ ...blockForm, mode: 'forever' })} />
                영원히
              </label>
            </div>
            {blockForm.mode === 'until' && (
              <input type="date" value={blockForm.until} onChange={(e) => setBlockForm({ ...blockForm, until: e.target.value })} style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)' }} />
            )}
            <input type="text" placeholder="사유 (선택)" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
              <button type="button" onClick={() => setBlockModal(null)} style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', cursor: 'pointer' }}>취소</button>
              <button type="button" disabled={busy} onClick={submitExtendedBlock} style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>블럭 추가</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(24, 37, 39, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
    <div role="dialog" className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 14, padding: '1.25rem', display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-ink)' }}>{title}</h3>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const VenueForm = ({ initial, onSubmit, onCancel }: { initial?: Partial<Venue>; onSubmit: (v: Omit<Venue, 'id'>) => void; onCancel: () => void }) => {
  const [form, setForm] = useState({
    floor: initial?.floor || '',
    name: initial?.name || '',
    code: initial?.code || '',
    availableStart: initial?.availableStart || '09:00',
    availableEnd: initial?.availableEnd || '22:00',
    availableDays: (initial?.availableDays || [0, 1, 2, 3, 4, 5, 6]) as number[],
  });
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const toggleDay = (d: number) => {
    const has = form.availableDays.includes(d);
    setForm({ ...form, availableDays: has ? form.availableDays.filter((x) => x !== d) : [...form.availableDays, d] });
  };
  return (
    <div style={{ display: 'grid', gap: '0.55rem' }}>
      <input placeholder="층 (예: 1F)" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)' }} />
      <input placeholder="장소 이름 (예: 사랑홀)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)' }} />
      <div style={{ fontSize: '0.75rem', color: 'var(--color-ink-2)', padding: '0.2rem 0.1rem' }}>코드는 층 번호에 따라 자동 부여됩니다 (예: 1층 → 101~199)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem' }}>시작<input type="time" value={form.availableStart} onChange={(e) => setForm({ ...form, availableStart: e.target.value })} style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)' }} /></label>
        <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.8rem' }}>종료<input type="time" value={form.availableEnd} onChange={(e) => setForm({ ...form, availableEnd: e.target.value })} style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)' }} /></label>
      </div>
      <div>
        <div style={{ fontSize: '0.8rem', marginBottom: '0.3rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>예약 가능 요일</div>
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {dayLabels.map((l, i) => (
            <button key={i} type="button" onClick={() => toggleDay(i)} style={{ padding: '0.35rem 0.6rem', borderRadius: 999, border: '1px solid', borderColor: form.availableDays.includes(i) ? '#65A30D' : 'var(--color-gray)', background: form.availableDays.includes(i) ? '#ECFCCB' : '#fff', color: form.availableDays.includes(i) ? '#4D7C0F' : 'var(--color-ink-2)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
        <button type="button" onClick={onCancel} style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', cursor: 'pointer' }}>취소</button>
        <button type="button" onClick={() => onSubmit(form)} disabled={!form.floor || !form.name} style={{ padding: '0.5rem 0.9rem', borderRadius: 8, border: 'none', background: '#65A30D', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>저장</button>
      </div>
    </div>
  );
};

type WeeklyBlockCardProps = {
  venues: Venue[];
  busy: boolean;
  slotMin: number;
  availableStart: string;
  availableEnd: string;
  onCreateBlocks: (items: Array<any>) => Promise<void>;
  editingGroup?: BlockGroup | null;
  onUpdateGroup: (payload: { id: string; venueId: string; slots: Array<{ dow: number; startMin: number }>; endDate: string | null; reason?: string }) => Promise<void>;
  onCancelEdit: () => void;
};

const WeeklyBlockCard = ({ venues, busy, slotMin, availableStart, availableEnd, onCreateBlocks, editingGroup, onUpdateGroup, onCancelEdit }: WeeklyBlockCardProps) => {
  const isMobile = useIsMobile();
  const editingGroupId = editingGroup?.id || null;
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id || '');
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [recurMode, setRecurMode] = useState<'none' | 'weeks' | 'until' | 'eternal'>('weeks');
  const [recurWeeks, setRecurWeeks] = useState<number>(4);
  const [recurUntil, setRecurUntil] = useState<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedVenueId && venues.length > 0) setSelectedVenueId(venues[0].id);
  }, [venues, selectedVenueId]);

  useEffect(() => {
    if (editingGroup) {
      setSelectedVenueId(editingGroup.venueId);
      const slots = expandGroupSlots(editingGroup);
      setSelectedCells(new Set(slots.map((s) => `${s.dow}-${s.startMin}`)));
      setReason(editingGroup.reason || '');
      if (editingGroup.endDate) {
        setRecurMode('until');
        setRecurUntil(editingGroup.endDate);
      } else {
        setRecurMode('weeks');
      }
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [editingGroup]);

  const resolveTargetVenues = (): Venue[] => {
    if (selectedVenueId === 'all') return venues;
    if (selectedVenueId.startsWith('floor:')) {
      const f = selectedVenueId.slice(6);
      return venues.filter((v) => v.floor === f);
    }
    const single = venues.find((v) => v.id === selectedVenueId);
    return single ? [single] : [];
  };
  const targetVenues = resolveTargetVenues();
  const venue = targetVenues[0];
  const isMulti = targetVenues.length > 1 || selectedVenueId === 'all' || selectedVenueId.startsWith('floor:');
  const availableDaysUnion = (() => {
    const set = new Set<number>();
    targetVenues.forEach((v) => v.availableDays.forEach((d) => set.add(d)));
    return set;
  })();
  const uniqueFloors = Array.from(new Set(venues.map((v) => v.floor))).sort();
  const startMin = toMin(availableStart);
  const endMin = toMin(availableEnd);
  const slotMins: number[] = [];
  for (let m = startMin; m < endMin; m += slotMin) slotMins.push(m);
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  const cellKey = (dow: number, min: number) => `${dow}-${min}`;
  const toggleCell = (dow: number, min: number) => {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      const k = cellKey(dow, min);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const applyBlocks = async () => {
    if (targetVenues.length === 0) { alert('장소를 선택하세요.'); return; }
    if (selectedCells.size === 0) { alert('블럭할 시간대를 선택하세요.'); return; }
    if (recurMode === 'until' && !recurUntil) { alert('종료 날짜를 선택하세요.'); return; }

    // 선택 셀 → slots 배열
    const slots: Array<{ dow: number; startMin: number }> = Array.from(selectedCells).map((k) => {
      const [dowStr, minStr] = k.split('-');
      return { dow: Number(dowStr), startMin: Number(minStr) };
    });

    // endDate 계산
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let endDate: string | null;
    if (recurMode === 'none') {
      const d = new Date(today);
      d.setDate(d.getDate() + 6);
      endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else if (recurMode === 'weeks') {
      const d = new Date(today);
      d.setDate(d.getDate() + Math.max(1, Math.min(52, recurWeeks)) * 7 - 1);
      endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else if (recurMode === 'until') {
      endDate = recurUntil;
    } else {
      endDate = null;
    }

    setSubmitting(true);
    try {
      if (editingGroupId) {
        // 편집 모드: PATCH (첫 번째 target venue만 반영)
        await onUpdateGroup({
          id: editingGroupId,
          venueId: targetVenues[0].id,
          slots,
          endDate,
          reason: reason || undefined,
        });
        alert('반복 블럭이 수정되었습니다.');
      } else {
        // 신규 등록: target venue당 하나씩 그룹 생성
        for (const tv of targetVenues) {
          await onCreateBlocks([{
            venueId: tv.id,
            slots,
            endDate,
            reason: reason || undefined,
          } as any]);
        }
        alert(`${targetVenues.length}개 장소에 반복 블럭이 적용되었습니다.`);
      }
      setSelectedCells(new Set());
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ padding: '1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#3F6212', fontWeight: 800 }}>🕒 예약시간 블록하기</h3>
      </div>

      <div style={{ display: 'grid', gap: '0.85rem' }}>
        <StepSection number={1} title="장소선택" inline>
          <select value={selectedVenueId} onChange={(e) => { setSelectedVenueId(e.target.value); setSelectedCells(new Set()); }} style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #D9F09E', background: '#fff', fontSize: '0.88rem', fontWeight: 700 }}>
            {venues.length === 0 && <option value="">등록된 장소 없음</option>}
            {venues.length > 0 && (
              <optgroup label="일괄 선택">
                <option value="all">모든장소</option>
                {uniqueFloors.map((f) => (
                  <option key={`floor:${f}`} value={`floor:${f}`}>{f} 모든장소</option>
                ))}
              </optgroup>
            )}
            {venues.length > 0 && (
              <optgroup label="개별 장소">
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.floor} · {v.name} ({v.code})</option>
                ))}
              </optgroup>
            )}
          </select>
        </StepSection>

        <StepSection number={2} title="시간선택" subtitle={`가로는 요일, 세로는 ${slotMin === 60 ? '1시간' : '30분'} 단위. 셀을 클릭하여 블럭할 시간대를 선택하세요.`}>
          <div className="responsive-x-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid #D9F09E', borderRadius: 10, background: '#fff' }}>
            <table style={{ width: '100%', minWidth: isMobile ? 360 : undefined, borderCollapse: 'collapse', fontSize: isMobile ? '0.68rem' : '0.72rem' }}>
              <thead>
                <tr style={{ background: '#ECFCCB' }}>
                  <th style={{ padding: '0.4rem 0.5rem', position: 'sticky', left: 0, background: '#ECFCCB', borderRight: '1px solid #D9F09E', minWidth: 56, zIndex: 2 }}>시간</th>
                  {dayLabels.map((label, dow) => {
                    const dayColor = dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : '#4D7C0F';
                    return (
                      <th key={dow} style={{ padding: '0.3rem 0.2rem', borderRight: '1px solid #F1F5F9', color: dayColor, fontWeight: 800, minWidth: 40 }}>{label}</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {slotMins.map((m) => {
                  const isHourStart = m % 60 === 0;
                  const h = Math.floor(m / 60);
                  const ampm = h < 12 ? 'am' : 'pm';
                  const h12 = h % 12 === 0 ? 12 : h % 12;
                  const hourLabel = `${h12}${ampm}`;
                  return (
                    <tr key={m} style={{ borderTop: isHourStart ? '2px solid #65A30D' : '1px solid #F1F5F9' }}>
                      <td style={{ padding: '0 0.35rem', position: 'sticky', left: 0, background: '#fff', borderRight: '2px solid #D9F09E', color: '#4D7C0F', fontWeight: isHourStart ? 800 : 600, fontSize: isHourStart ? '0.66rem' : '0.6rem', opacity: isHourStart ? 1 : 0.55, textAlign: 'right', whiteSpace: 'nowrap', lineHeight: 1 }}>{isHourStart ? hourLabel : ':30'}</td>
                      {dayLabels.map((label, dow) => {
                        const selected = selectedCells.has(cellKey(dow, m));
                        const isVenueAvailable = availableDaysUnion.has(dow);
                        const clickable = !!venue && isVenueAvailable;
                        const bg = !clickable ? '#E5E7EB' : selected ? '#DC2626' : '#F7FEE7';
                        const color = !clickable ? '#9CA3AF' : selected ? '#fff' : '#4D7C0F';
                        return (
                          <td key={dow} style={{ padding: 0, borderRight: '1px solid #F1F5F9', minWidth: 40 }}>
                            <button
                              type="button"
                              disabled={!clickable}
                              onClick={() => toggleCell(dow, m)}
                              title={`${label} ${toHHMM(m)} ${selected ? '선택됨 (클릭시 해제)' : '클릭하여 블럭 선택'}`}
                              style={{ width: '100%', height: 18, border: 'none', background: bg, color, cursor: clickable ? 'pointer' : 'not-allowed', fontSize: '0.6rem', fontWeight: 700, lineHeight: 1 }}
                            >
                              {selected ? '✕' : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', marginTop: '0.4rem' }}>선택 <strong style={{ color: '#B91C1C' }}>{selectedCells.size}개</strong></div>
        </StepSection>

        <StepSection number={3} title="반복 선택">
          <div style={{ display: 'grid', gap: '0.65rem', padding: '0.85rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#3F6212', flexWrap: 'wrap' }}>
              <span>블럭을 매주 반복할까요?</span>
              <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setRecurMode('weeks')}
                  style={{ padding: '0.3rem 0.9rem', borderRadius: 999, border: '1px solid', borderColor: recurMode !== 'none' ? '#65A30D' : 'var(--color-gray)', background: recurMode !== 'none' ? '#65A30D' : '#fff', color: recurMode !== 'none' ? '#fff' : 'var(--color-ink-2)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  예
                </button>
                <button
                  type="button"
                  onClick={() => setRecurMode('none')}
                  style={{ padding: '0.3rem 0.9rem', borderRadius: 999, border: '1px solid', borderColor: recurMode === 'none' ? '#65A30D' : 'var(--color-gray)', background: recurMode === 'none' ? '#65A30D' : '#fff', color: recurMode === 'none' ? '#fff' : 'var(--color-ink-2)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  아니오
                </button>
              </div>
              <input type="text" placeholder="사유 (선택)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ padding: '0.4rem 0.55rem', borderRadius: 6, border: '1px solid var(--color-gray)', fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-ink)', flex: '1 1 180px', minWidth: 140 }} />
            </div>

            {recurMode === 'none' ? (
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#3F6212' }}>이번 주 1회만 적용됩니다.</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem', paddingTop: '0.25rem', borderTop: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#3F6212' }}>반복 범위 (하나 선택)</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="radio" checked={recurMode === 'weeks'} onChange={() => setRecurMode('weeks')} />
                  <input type="number" min={1} max={52} value={recurWeeks} onChange={(e) => setRecurWeeks(Number(e.target.value))} onFocus={() => setRecurMode('weeks')} style={{ width: 64, padding: '0.3rem 0.4rem', borderRadius: 6, border: '1px solid var(--color-gray)' }} />
                  <span>주 동안 반복</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', flexWrap: 'wrap' }}>
                  <input type="radio" checked={recurMode === 'until'} onChange={() => setRecurMode('until')} />
                  <input type="date" value={recurUntil} onChange={(e) => setRecurUntil(e.target.value)} onFocus={() => setRecurMode('until')} style={{ padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-gray)', fontSize: '0.85rem' }} />
                  <span>까지 반복</span>
                </label>
              </div>
            )}
          </div>
        </StepSection>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
          {editingGroupId && (
            <>
              <span style={{ marginRight: 'auto', fontSize: '0.85rem', fontWeight: 700, color: '#3F6212' }}>✏️ 기존 반복 블럭 수정 중</span>
              <button type="button" onClick={() => { onCancelEdit(); setSelectedCells(new Set()); setReason(''); }} style={{ padding: '0.55rem 0.85rem', borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>수정 취소</button>
            </>
          )}
          {(() => {
            const disabled = busy || submitting || selectedCells.size === 0 || !venue;
            const label = editingGroupId ? '변경 저장' : '블럭 적용';
            return (
              <button type="button" disabled={disabled} onClick={applyBlocks} style={{ padding: '0.6rem 1.25rem', borderRadius: 8, border: 'none', background: submitting ? '#9CA3AF' : disabled ? '#E5E7EB' : '#DC2626', color: disabled && !submitting ? '#9CA3AF' : '#fff', fontWeight: 800, fontSize: '0.92rem', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled && !submitting ? 0.85 : 1 }}>
                {submitting ? '적용 중...' : label}
              </button>
            );
          })()}
        </div>
      </div>
    </section>
  );
};

const StepSection = ({ number, title, subtitle, children, inline }: { number: number; title: string; subtitle?: string; children: React.ReactNode; inline?: boolean }) => {
  const isMobile = useIsMobile();
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: inline ? 0 : '0.4rem', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 999, background: '#65A30D', color: '#fff', fontWeight: 800, fontSize: '0.8rem', flex: '0 0 auto' }}>{number}</span>
        <strong style={{ fontSize: '0.95rem', color: '#3F6212', fontWeight: 800 }}>{title}</strong>
        {subtitle && <span style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', fontWeight: 500 }}>{subtitle}</span>}
        {inline && <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.25rem' }}>{children}</div>}
      </div>
      {!inline && <div style={{ paddingLeft: isMobile ? 0 : '2rem' }}>{children}</div>}
    </div>
  );
};

const VenueFloorCard = ({ venues, floors: floorsProp, onAdd, onDelete, onAddFloor }: { venues: Venue[]; floors: string[]; onAdd: (floor: string) => void; onDelete: (id: string) => void; onAddFloor: (label: string) => Promise<void> | void }) => {
  const presentFloors = Array.from(new Set(venues.map((v) => v.floor)));
  const floors = Array.from(new Set([...floorsProp, ...presentFloors])).sort((a, b) => {
    const na = Number((a.match(/(\d+)/) || [])[1] || 0);
    const nb = Number((b.match(/(\d+)/) || [])[1] || 0);
    return na - nb;
  });
  const addNewFloor = async () => {
    const input = window.prompt('추가할 층 번호를 입력하세요 (예: 5, 지하1):');
    if (!input || !input.trim()) return;
    const raw = input.trim();
    const label = /^\d+$/.test(raw) ? `${raw}F` : raw;
    if (floors.includes(label)) { alert('이미 존재하는 층입니다.'); return; }
    await onAddFloor(label);
  };
  return (
  <section style={{ padding: '1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', color: '#3F6212', fontWeight: 800 }}>🏢 장소관리</h3>
      <button type="button" onClick={addNewFloor} style={{ padding: '0.35rem 0.8rem', borderRadius: 999, border: '1px solid #65A30D', background: '#ECFCCB', color: '#4D7C0F', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>+ 층 추가</button>
    </div>
    <div style={{ display: 'grid', gap: '0.55rem' }}>
      {floors.map((floor) => {
        const floorVenues = venues.filter((v) => v.floor === floor);
        return (
          <div key={floor} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '0.75rem', alignItems: 'center', padding: '0.55rem 0.75rem', borderRadius: 10, background: '#fff', border: '1px solid #D9F09E' }}>
            <div style={{ padding: '0.3rem 0.55rem', borderRadius: 8, background: '#ECFCCB', color: '#3F6212', fontWeight: 800, fontSize: '0.9rem', textAlign: 'center' }}>{floor}</div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {floorVenues.map((v) => (
                <div key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.5rem 0.35rem 0.7rem', borderRadius: 999, background: '#fff', border: '1px solid #65A30D' }}>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--color-ink)' }}>{v.name}</strong>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)', fontFamily: 'monospace' }}>{v.code}</span>
                  <button
                    type="button"
                    onClick={() => onDelete(v.id)}
                    aria-label="삭제"
                    title="삭제"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 999, border: 'none', background: 'transparent', color: '#b91c1c', fontSize: '0.9rem', cursor: 'pointer', padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => onAdd(floor)}
                aria-label={`${floor} 장소 추가`}
                title={`${floor} 장소 추가`}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 999, border: '2px dashed #65A30D', background: '#F7FEE7', color: '#4D7C0F', fontSize: '1.1rem', fontWeight: 800, cursor: 'pointer' }}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  </section>
  );
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const formatDays = (days: number[]) => {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((d) => DAY_LABELS[d]).join(', ');
};

const formatMinAmPm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}${ampm}`;
};

const BlockGroupsCard = ({ groups, venues, onEdit, onDelete }: { groups: BlockGroup[]; venues: Venue[]; onEdit: (g: BlockGroup) => void; onDelete: (id: string) => void }) => {
  const isMobile = useIsMobile();
  return (
  <section style={{ padding: '1rem', borderRadius: 12, background: '#fff', border: '1px solid var(--color-surface-border)' }}>
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: 'var(--color-ink)' }}>🔁 등록된 반복 블럭 ({groups.length})</h3>
    {groups.length === 0 ? (
      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>등록된 반복 블럭이 없습니다.</p>
    ) : (
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.4rem' }}>
        {groups.map((g) => {
          const v = venues.find((x) => x.id === g.venueId);
          const expandedSlots = expandGroupSlots(g);
          const uniqueDays = Array.from(new Set(expandedSlots.map((s) => s.dow))).sort((a, b) => a - b);
          const startMins = expandedSlots.map((s) => s.startMin);
          const minStart = startMins.length ? Math.min(...startMins) : 0;
          const maxEnd = startMins.length ? Math.max(...startMins) + SLOT_MIN : 0;
          return (
            <li key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', border: '1.5px solid #DC2626', borderRadius: 10, background: '#FEF2F2', flexWrap: isMobile ? 'wrap' : 'nowrap', overflow: 'hidden', boxShadow: '0 1px 3px rgba(220, 38, 38, 0.12)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 999, background: '#DC2626', color: '#fff', fontSize: '0.7rem', fontWeight: 800, flex: '0 0 auto' }}>⛔</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#991B1B', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                {v ? `${v.floor}·${v.name}` : g.venueId}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#B91C1C', fontWeight: 700, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                매주 {formatDays(uniqueDays)}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#B91C1C', fontWeight: 700, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                {formatMinAmPm(minStart)}~{formatMinAmPm(maxEnd)}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#991B1B', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                · {g.endDate ? `${g.endDate}까지` : '종료 없음'}
              </span>
              {g.reason && (
                <span style={{ fontSize: '0.75rem', color: '#991B1B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto' }}>
                  · {g.reason}
                </span>
              )}
              <div style={{ display: 'flex', gap: '0.3rem', marginLeft: 'auto', flex: '0 0 auto' }}>
                <button type="button" onClick={() => onEdit(g)} style={{ padding: '0.3rem 0.65rem', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#B91C1C', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>수정</button>
                <button type="button" onClick={() => onDelete(g.id)} style={{ padding: '0.3rem 0.65rem', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>삭제</button>
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </section>
  );
};

export default VenueManager;
