import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 큐티 작성 후 "어느 셀에 공개할까요?" 셀렉터.
 * 참여(완료·✓)는 이미 노트 작성으로 반영됨. 여기선 내용을 어느 셀에 노출할지만 고른다.
 * 안 골라도 됨(비공개 참여).
 */

type Cell = { id: string; name: string; enabled_modes?: { qt?: boolean } };
type Props = { profileId: string; date: string; onClose: () => void };

const ShareToCellsModal = ({ profileId, date, onClose }: Props) => {
  const isMobile = useIsMobile();
  const [cells, setCells] = useState<Cell[]>([]);
  const [shared, setShared] = useState<Record<string, string>>({}); // cellId → visibility
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [vis, setVis] = useState<'full' | 'feelings'>('full');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cr, sr] = await Promise.all([
          fetch(`/api/cells/my?profileId=${encodeURIComponent(profileId)}`).then((r) => r.json()),
          fetch(`/api/cell-shares?profileId=${encodeURIComponent(profileId)}&date=${date}&mode=qt`).then((r) => r.json()),
        ]);
        if (!alive) return;
        const qtCells = ((cr.cells || []) as Cell[]).filter((c) => c.enabled_modes?.qt);
        setCells(qtCells);
        const map: Record<string, string> = {};
        for (const s of (sr.shares || []) as Array<{ cellId: string; visibility: string }>) map[s.cellId] = s.visibility;
        setShared(map);
      } catch {
        if (alive) setCells([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [profileId, date]);

  const toggle = async (cellId: string) => {
    if (busy) return;
    const isShared = cellId in shared;
    setBusy(cellId);
    // 낙관적
    setShared((prev) => {
      const next = { ...prev };
      if (isShared) delete next[cellId]; else next[cellId] = vis;
      return next;
    });
    try {
      if (isShared) {
        const r = await fetch(`/api/cell-shares?profileId=${encodeURIComponent(profileId)}&cellId=${encodeURIComponent(cellId)}&mode=qt&date=${date}`, { method: 'DELETE' });
        if (!r.ok) throw new Error();
      } else {
        const r = await fetch('/api/cell-shares', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, cellId, mode: 'qt', date, visibility: vis }),
        });
        if (!r.ok) throw new Error();
      }
    } catch {
      // 롤백
      setShared((prev) => {
        const next = { ...prev };
        if (isShared) next[cellId] = vis; else delete next[cellId];
        return next;
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="셀에 공개" style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex',
      alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 120, padding: isMobile ? 0 : '0.5rem',
    }}>
      <div style={{
        width: '100%', maxWidth: isMobile ? '100%' : 440, background: '#fff',
        borderRadius: isMobile ? '18px 18px 0 0' : 16, padding: isMobile ? '1.35rem 1rem 1.75rem' : '1.5rem 1.25rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'grid', gap: '0.9rem', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#3F6212' }}>어느 셀에 공개할까요?</h2>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.83rem', color: 'var(--color-ink-2)', lineHeight: 1.55 }}>
            오늘 묵상을 셀 친구에게 나눠요. <strong>안 골라도 참여(✓)는 됩니다</strong> — 내용만 비공개예요.
          </p>
        </div>

        {/* 공개 범위 */}
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>공개 범위 (새로 공개할 때 적용)</span>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {(['full', 'feelings'] as const).map((v) => (
              <button key={v} onClick={() => setVis(v)} style={{
                flex: 1, padding: '0.55rem', minHeight: 40, borderRadius: 8, cursor: 'pointer',
                background: vis === v ? '#ECFCCB' : '#fff', border: `1px solid ${vis === v ? '#84CC16' : 'var(--color-gray)'}`,
                color: vis === v ? '#3F6212' : 'var(--color-ink-2)', fontSize: '0.83rem', fontWeight: 700,
              }}>
                {v === 'full' ? '묵상 전문' : '느낀점만'}
              </button>
            ))}
          </div>
        </div>

        {/* 셀 목록 */}
        {loading ? (
          <div style={{ padding: '1rem', color: 'var(--color-ink-2)', fontSize: '0.85rem' }}>불러오는 중…</div>
        ) : cells.length === 0 ? (
          <div style={{ padding: '0.9rem', borderRadius: 10, background: 'var(--color-surface-muted)', border: '1px solid var(--color-surface-border)', fontSize: '0.83rem', color: 'var(--color-ink-2)' }}>
            큐티를 하는 셀이 아직 없어요.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {cells.map((c) => {
              const on = c.id in shared;
              return (
                <button key={c.id} onClick={() => toggle(c.id)} disabled={busy === c.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
                  padding: '0.7rem 0.85rem', minHeight: 48, borderRadius: 10, cursor: busy === c.id ? 'wait' : 'pointer',
                  background: on ? '#F7FEE7' : '#fff', border: `1px solid ${on ? '#A3E635' : 'var(--color-gray)'}`, textAlign: 'left',
                }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ flexShrink: 0, fontSize: '0.78rem', fontWeight: 800, color: on ? '#4D7C0F' : 'var(--color-ink-2)' }}>
                    {busy === c.id ? '…' : on ? `✓ 공개 (${shared[c.id] === 'feelings' ? '느낀점' : '전문'})` : '공개하기'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <button onClick={onClose} style={{
          width: '100%', padding: '0.8rem', minHeight: 48, borderRadius: 12, border: 'none',
          background: 'var(--color-primary)', color: '#fff', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer',
        }}>
          완료
        </button>
      </div>
    </div>
  );
};

export default ShareToCellsModal;
