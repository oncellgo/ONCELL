import { useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

type Props = {
  profileId: string;
  missingFields: Array<'realName' | 'contact'>;
  message?: string;
  onComplete: () => void;
  onCancel?: () => void;
};

const RequiredInfoModal = ({ profileId, missingFields, message, onComplete, onCancel }: Props) => {
  const isMobile = useIsMobile();
  const needRealName = missingFields.includes('realName');
  const needContact = missingFields.includes('contact');

  const [realName, setRealName] = useState('');
  const [countryCode, setCountryCode] = useState('+65');
  const [contactLocal, setContactLocal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatContact = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  };

  const submit = async () => {
    setError(null);
    if (needRealName && !realName.trim()) { setError('실명을 입력해주세요.'); return; }
    if (needContact && !contactLocal.trim()) { setError('연락처를 입력해주세요.'); return; }

    const fullContact = needContact ? `${countryCode} ${contactLocal.trim()}` : '';

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/complete-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          ...(needRealName ? { realName: realName.trim() } : {}),
          ...(needContact ? { contact: fullContact } : {}),
        }),
      });
      if (!res.ok) {
        setError('저장 실패. 다시 시도해주세요.');
        setSubmitting(false);
        return;
      }
      onComplete();
    } catch {
      setError('저장 실패. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="필수정보 입력"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: isMobile ? 0 : '0.5rem',
      }}
    >
      <div
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 440,
          padding: isMobile ? '1.5rem 1rem 2rem' : '1.5rem 1.25rem',
          borderRadius: isMobile ? '18px 18px 0 0' : 16,
          background: '#fff',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          display: 'grid',
          gap: '1rem',
        }}
      >
        <div style={{ textAlign: 'center', paddingBottom: '0.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#3F6212' }}>필수정보 입력</h2>
          {message && <p style={{ margin: '0.6rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.9rem', lineHeight: 1.6 }}>{message}</p>}
        </div>

        {needRealName && (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="req-realname" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)' }}>
              실명 <span style={{ color: '#DC2626', fontSize: '0.9em' }}>*</span>
            </label>
            <input
              id="req-realname"
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="홍길동"
              style={{ padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '1rem', minHeight: 48 }}
            />
          </div>
        )}

        {needContact && (
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="req-contact" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)' }}>
              연락처 <span style={{ color: '#DC2626', fontSize: '0.9em' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <select
                aria-label="국가코드"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                style={{
                  padding: '0.75rem 0.5rem',
                  borderRadius: 10,
                  border: '1px solid var(--color-gray)',
                  fontSize: '0.95rem',
                  background: '#fff',
                  color: 'var(--color-ink)',
                  fontWeight: 700,
                  flex: '0 0 auto',
                  minHeight: 48,
                  minWidth: isMobile ? 90 : 100,
                }}
              >
                <option value="+65">+65 SG</option>
                <option value="+82">+82 KR</option>
                <option value="+1">+1 US</option>
                <option value="+86">+86 CN</option>
                <option value="+60">+60 MY</option>
                <option value="+81">+81 JP</option>
              </select>
              <input
                id="req-contact"
                type="tel"
                value={contactLocal}
                onChange={(e) => setContactLocal(formatContact(e.target.value))}
                placeholder="0000-0000"
                inputMode="numeric"
                style={{ flex: 1, padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '1rem', minHeight: 48 }}
              />
            </div>
          </div>
        )}

        {error && <p style={{ margin: 0, fontSize: '0.82rem', color: '#DC2626', fontWeight: 700 }}>{error}</p>}

        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          gap: '0.5rem',
          marginTop: '0.25rem',
        }}>
          {onCancel && (
            <button
              type="button"
              disabled={submitting}
              onClick={onCancel}
              style={{
                flex: isMobile ? 'unset' : 1,
                width: isMobile ? '100%' : 'auto',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                border: '1px solid var(--color-gray)',
                background: '#fff',
                color: 'var(--color-ink-2)',
                fontSize: '0.95rem',
                fontWeight: 700,
                minHeight: 48,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              취소
            </button>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            style={{
              flex: isMobile ? 'unset' : 2,
              width: isMobile ? '100%' : 'auto',
              padding: '0.85rem 1rem',
              borderRadius: 12,
              border: 'none',
              background: submitting ? '#9CA3AF' : 'var(--color-primary)',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 800,
              minHeight: 48,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '저장 중...' : '저장하고 계속'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequiredInfoModal;
