import { useState } from 'react';

type Props = {
  profileId: string;
  missingFields: Array<'realName' | 'contact'>;
  message?: string;
  onComplete: () => void;
  onCancel?: () => void;
};

const RequiredInfoModal = ({ profileId, missingFields, message, onComplete, onCancel }: Props) => {
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
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '0.5rem' }}>
      <div className="modal-card" style={{ width: '100%', maxWidth: 440, padding: '1.25rem', borderRadius: 16, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'grid', gap: '0.85rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem' }}>📝</div>
          <h2 style={{ margin: '0.4rem 0 0', fontSize: '1.15rem', color: '#3F6212' }}>필수정보 입력</h2>
          {message && <p style={{ margin: '0.5rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.9rem', lineHeight: 1.55 }}>{message}</p>}
        </div>

        {needRealName && (
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-ink)' }}>실명 <span style={{ color: '#DC2626' }}>*</span></span>
            <input
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="홍길동"
              style={{ padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem' }}
            />
          </label>
        )}

        {needContact && (
          <label style={{ display: 'grid', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-ink)' }}>연락처 <span style={{ color: '#DC2626' }}>*</span></span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                style={{ padding: '0.65rem 0.6rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, flex: '0 0 auto' }}
              >
                <option value="+65">+65 (SG)</option>
                <option value="+82">+82 (KR)</option>
                <option value="+1">+1 (US)</option>
                <option value="+86">+86 (CN)</option>
                <option value="+60">+60 (MY)</option>
                <option value="+81">+81 (JP)</option>
              </select>
              <input
                type="tel"
                value={contactLocal}
                onChange={(e) => setContactLocal(formatContact(e.target.value))}
                placeholder="0000-0000"
                inputMode="numeric"
                style={{ flex: 1, padding: '0.65rem 0.8rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem' }}
              />
            </div>
          </label>
        )}

        {error && <p style={{ margin: 0, fontSize: '0.82rem', color: '#DC2626', fontWeight: 700 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onCancel && (
            <button
              type="button"
              disabled={submitting}
              onClick={onCancel}
              style={{ flex: 1, padding: '0.7rem 1rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontSize: '0.92rem', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              취소
            </button>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            style={{ flex: 2, padding: '0.7rem 1rem', borderRadius: 10, border: 'none', background: submitting ? '#9CA3AF' : 'var(--color-primary)', color: '#fff', fontSize: '0.95rem', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? '저장 중...' : '저장하고 계속'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequiredInfoModal;
