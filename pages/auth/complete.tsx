import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

const splitContact = (full: string): { cc: string; rest: string } => {
  const s = (full || '').trim();
  const m = s.match(/^(\+\d{1,3})[\s-]*(.+)$/);
  if (m) return { cc: m[1], rest: m[2].trim() };
  return { cc: '+65', rest: s };
};

const CompleteSignupPage = () => {
  const router = useRouter();

  const profileId = typeof router.query.profileId === 'string' ? router.query.profileId : '';
  const nickname = typeof router.query.nickname === 'string' ? router.query.nickname : '';
  const email = typeof router.query.email === 'string' ? router.query.email : '';
  const fieldsParam = typeof router.query.fields === 'string' ? router.query.fields : '';
  const next = typeof router.query.next === 'string' ? router.query.next : 'approved';

  const fields = useMemo(() => fieldsParam.split(',').filter(Boolean), [fieldsParam]);
  const needPrivacy = fields.includes('privacyConsent');
  // 실명·연락처는 missingFields 포함 여부와 무관하게 항상 입력/확인받고 서버에 저장한다.
  // 기존 값이 있으면 prefill.

  const [realName, setRealName] = useState('');
  const [countryCode, setCountryCode] = useState('+65');
  const [contactLocal, setContactLocal] = useState('');
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 기존 프로필 값 prefill
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    fetch(`/api/profile?profileId=${encodeURIComponent(profileId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const p = d?.profile;
        if (!p) return;
        if (p.realName) setRealName(p.realName);
        if (p.contact) {
          const { cc, rest } = splitContact(p.contact);
          setCountryCode(cc);
          setContactLocal(rest);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profileId]);

  const formatContact = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  };

  const submit = async () => {
    setError(null);
    if (!realName.trim()) { setError('실명을 입력해주세요.'); return; }
    if (!contactLocal.trim()) { setError('연락처를 입력해주세요.'); return; }
    if (needPrivacy && !privacyChecked) { setError('개인정보 수집 및 이용에 동의해주세요.'); return; }

    const fullContact = `${countryCode} ${contactLocal.trim()}`;

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/complete-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          realName: realName.trim(),
          contact: fullContact,
          ...(needPrivacy ? { privacyConsent: true } : {}),
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
        <div style={{ width: '100%', maxWidth: 520, padding: '2rem 1.5rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1.1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', lineHeight: 1 }}>📝</div>
            <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.2rem', color: '#3F6212' }}>가입정보 입력</h1>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.88rem', lineHeight: 1.6, wordBreak: 'keep-all' }}>가입을 완료하려면 아래 정보를 입력해주세요.</p>
          </div>

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

          {needPrivacy && (
            <section style={{ padding: '0.9rem 1rem', borderRadius: 10, background: '#F7FEE7', border: '1px solid #D9F09E', display: 'grid', gap: '0.65rem' }}>
              <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#3F6212', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <span aria-hidden>🔒</span>
                <span>개인정보 수집 및 이용 동의 <span style={{ color: '#DC2626' }}>[필수]</span></span>
              </h2>

              <div style={{ display: 'grid', gap: '0.55rem', fontSize: '0.82rem', color: '#4B5563', lineHeight: 1.6 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, color: '#365314' }}>1. 수집 항목 및 목적</p>
                  <p style={{ margin: '0.15rem 0 0' }}>
                    <strong style={{ color: '#365314' }}>수집 항목:</strong> 이름, 연락처(휴대전화 번호), 이메일·닉네임 (카카오/구글 소셜 로그인 제공)
                  </p>
                  <p style={{ margin: '0.15rem 0 0' }}>
                    <strong style={{ color: '#365314' }}>수집 목적:</strong> 교인 식별 및 본인 확인, 장소 예약 신청·관리 및 예약자 연락, 개인화 서비스(큐티·성경통독 기록) 제공
                  </p>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, color: '#365314' }}>2. 보유 및 이용 기간</p>
                  <p style={{ margin: '0.15rem 0 0' }}>회원 탈퇴 시 즉시 파기</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 800, color: '#365314' }}>3. 동의 거부 권리 및 불이익 안내</p>
                  <p style={{ margin: '0.15rem 0 0' }}>
                    귀하는 정보 수집에 동의하지 않을 수 있습니다. 단, 이름과 연락처는 서비스 제공을 위한 <strong style={{ color: '#B91C1C' }}>필수 정보</strong>로, 입력을 거부하거나 허위 정보를 입력할 경우 회원가입 및 장소 예약 서비스 이용이 제한됩니다.
                  </p>
                  <p style={{ margin: '0.15rem 0 0', color: '#B91C1C' }}>
                    입력된 정보가 허위로 판명될 경우, 사전 고지 없이 예약이 임의 취소될 수 있음을 알려드립니다.
                  </p>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.65rem 0.8rem', borderRadius: 8, background: '#fff', border: '1px solid #D9F09E', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={privacyChecked}
                  onChange={(e) => setPrivacyChecked(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: '#65A30D', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#3F6212', lineHeight: 1.5 }}>
                  본 사이트 이용을 위해 개인정보 수집 및 이용에 동의하십니까? <span style={{ color: '#DC2626' }}>*</span>
                </span>
              </label>
            </section>
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
