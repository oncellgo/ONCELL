import { ReactNode, useEffect } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 공용 커스텀 확인 모달.
 * `window.confirm()` 대체용 — 디자인 시스템과 어울리는 카드/버튼, 강조된 경고 메시지 지원.
 *
 * 사용 예:
 *   <ConfirmModal
 *     open={deleting}
 *     title="이 예약을 삭제하시겠어요?"
 *     details={[ '테스트수요', '2026-04-22 08:00~10:00', '3F 누가실' ]}
 *     warning="삭제 후에는 되돌릴 수 없습니다."
 *     confirmLabel="삭제"
 *     confirmTone="danger"
 *     onCancel={() => setDeleting(null)}
 *     onConfirm={actuallyDelete}
 *   />
 */
export type ConfirmModalProps = {
  open: boolean;
  title: string;
  details?: Array<string | ReactNode>;
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'primary';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const ConfirmModal = ({
  open,
  title,
  details,
  warning,
  confirmLabel = '확인',
  cancelLabel = '취소',
  confirmTone = 'primary',
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) => {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmBg = confirmTone === 'danger' ? '#DC2626' : 'var(--color-primary)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : '1rem',
      }}
    >
      <div
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 440,
          background: '#fff',
          borderRadius: isMobile ? '18px 18px 0 0' : 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* 헤더: 위험 톤이면 빨간 배너, primary 면 라임 배너 */}
        <div style={{
          padding: isMobile ? '1rem 1rem 0.85rem' : '1rem 1.25rem',
          background: confirmTone === 'danger' ? '#FEF2F2' : '#F7FEE7',
          borderBottom: `1px solid ${confirmTone === 'danger' ? '#FECACA' : '#D9F09E'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
        }}>
          <span aria-hidden style={{ fontSize: '1.5rem', lineHeight: 1 }}>
            {confirmTone === 'danger' ? '⚠️' : '❔'}
          </span>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: confirmTone === 'danger' ? '#991B1B' : '#3F6212' }}>
            {title}
          </h3>
        </div>

        <div style={{ padding: isMobile ? '1rem' : '1rem 1.25rem', display: 'grid', gap: '0.85rem' }}>
          {details && details.length > 0 && (
            <div style={{ padding: '0.7rem 0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.3rem', fontSize: '0.9rem' }}>
              {details.map((d, i) => (
                <div key={i} style={{ color: 'var(--color-ink)', fontWeight: i === 0 ? 800 : 600 }}>{d}</div>
              ))}
            </div>
          )}

          {warning && (
            <div style={{
              padding: '0.75rem 0.9rem',
              borderRadius: 10,
              background: confirmTone === 'danger' ? '#FEE2E2' : '#FEF3C7',
              border: `1.5px solid ${confirmTone === 'danger' ? '#FCA5A5' : '#FDE68A'}`,
              color: confirmTone === 'danger' ? '#991B1B' : '#92400E',
              fontSize: '0.9rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              lineHeight: 1.55,
            }}>
              <span aria-hidden style={{ fontSize: '1.05rem', lineHeight: 1.2 }}>🚨</span>
              <span>{warning}</span>
            </div>
          )}
        </div>

        <div style={{
          padding: isMobile ? '0.85rem 1rem 1.2rem' : '0.85rem 1.25rem 1.1rem',
          borderTop: '1px solid var(--color-surface-border)',
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          justifyContent: 'flex-end',
          gap: '0.5rem',
        }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '0.75rem 1.1rem',
              minHeight: 48,
              borderRadius: 12,
              border: '1px solid var(--color-gray)',
              background: '#fff',
              color: 'var(--color-ink)',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >{cancelLabel}</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '0.75rem 1.4rem',
              minHeight: 48,
              borderRadius: 12,
              border: 'none',
              background: busy ? '#9CA3AF' : confirmBg,
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.95rem',
              cursor: busy ? 'not-allowed' : 'pointer',
              boxShadow: busy ? 'none' : `0 4px 12px ${confirmTone === 'danger' ? 'rgba(220,38,38,0.25)' : 'rgba(32,205,141,0.25)'}`,
            }}
          >{busy ? '처리 중…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
