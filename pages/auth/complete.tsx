import Head from 'next/head';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

const CompleteSignupPage = () => {
  const router = useRouter();

  const profileId = typeof router.query.profileId === 'string' ? router.query.profileId : '';
  const nickname = typeof router.query.nickname === 'string' ? router.query.nickname : '';
  const email = typeof router.query.email === 'string' ? router.query.email : '';
  const fieldsParam = typeof router.query.fields === 'string' ? router.query.fields : '';
  const next = typeof router.query.next === 'string' ? router.query.next : 'approved';

  const fields = useMemo(() => fieldsParam.split(',').filter(Boolean), [fieldsParam]);
  const needRealName = fields.includes('realName');
  const needContact = fields.includes('contact');

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

      if (next === 'pending') {
        router.replace('/auth/pending');
        return;
      }
      if (next === 'rejected') {
        router.replace('/auth/rejected');
        return;
      }
      router.replace(`/dashboard?profileId=${encodeURIComponent(profileId)}&nickname=${encodeURIComponent(nickname)}&email=${encodeURIComponent(email)}`);
    } catch {
      setError('저장 실패. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head><title>KCIS | 가입정보 입력</title></Head>
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: 440, padding: '2rem 1.5rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1.1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>📝</div>
            <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.2rem', color: '#3F6212' }}>가입정보 입력</h1>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.88rem', lineHeight: 1.6, wordBreak: 'keep-all' }}>가입을 완료하려면 아래 정보를 입력해주세요.</p>
          </div>

          {needRealName && (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-ink)' }}>실명 <span style={{ color: '#DC2626' }}>*</span></span>
              <input
                type="text"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="홍길동"
                style={{ padding: '0.75rem 0.9rem', minHeight: 44, borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem', width: '100%' }}
              />
            </label>
          )}

          {needContact && (
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-ink)' }}>연락처 <span style={{ color: '#DC2626' }}>*</span></span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  style={{ padding: '0.75rem 0.5rem', minHeight: 44, borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem', background: '#fff', color: 'var(--color-ink)', fontWeight: 700, flex: '0 0 auto' }}
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
                  style={{ flex: 1, padding: '0.75rem 0.9rem', minHeight: 44, borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.95rem' }}
                />
              </div>
            </label>
          )}

          {error && <p style={{ margin: 0, fontSize: '0.82rem', color: '#DC2626', fontWeight: 700 }}>{error}</p>}

          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            style={{
              padding: '0.85rem 1rem',
              minHeight: 48,
              borderRadius: 10,
              border: 'none',
              background: submitting ? '#9CA3AF' : 'var(--color-primary)',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: submitting ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            {submitting ? '저장 중...' : '저장하고 계속'}
          </button>
        </div>
      </main>
    </>
  );
};

export default CompleteSignupPage;
