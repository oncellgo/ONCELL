import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 프로필 수정 모달 — 실명 + 연락처 수정.
 * 가입일자 표시 (읽기 전용).
 * - SubHeader 사용자 칩 클릭 / 예약 picker '예약자 정보' 섹션에서 공용 사용
 */
type Props = {
  profileId: string;
  provider?: string | null;   // 'kakao' | 'google' 등 (POST에 필요)
  nickname?: string | null;
  email?: string | null;
  initialRealName?: string | null;
  initialContact?: string | null;
  onClose: () => void;
  onSaved?: (next: { realName: string; contact: string }) => void;
};

const COUNTRY_CODES = [
  { code: '+65', flag: '🇸🇬' },
  { code: '+82', flag: '🇰🇷' },
  { code: '+1', flag: '🇺🇸' },
  { code: '+44', flag: '🇬🇧' },
  { code: '+81', flag: '🇯🇵' },
];

const splitContact = (full: string | null | undefined): { cc: string; rest: string } => {
  const s = (full || '').trim();
  const m = s.match(/^(\+\d{1,3})[\s-]*(.+)$/);
  if (m) return { cc: m[1], rest: m[2].trim() };
  return { cc: '+65', rest: s };
};

const ProfileModal = ({ profileId, provider, nickname, email, initialRealName, initialContact, onClose, onSaved }: Props) => {
  const isMobile = useIsMobile();
  const [realName, setRealName] = useState(initialRealName || '');
  const { cc: initCC, rest: initRest } = splitContact(initialContact);
  const [countryCode, setCountryCode] = useState(initCC);
  const [contactLocal, setContactLocal] = useState(initRest);
  const [firstLoginAt, setFirstLoginAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/profile?profileId=${encodeURIComponent(profileId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const p = d?.profile;
        if (p) {
          if (!initialRealName) setRealName(p.realName || '');
          if (!initialContact) {
            const { cc, rest } = splitContact(p.contact || '');
            setCountryCode(cc);
            setContactLocal(rest);
          }
        }
        setFirstLoginAt(d?.firstLoginAt || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId]);

  const save = async () => {
    if (!realName.trim() || !contactLocal.trim()) { setMsg('실명과 연락처를 입력해주세요.'); return; }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          provider: provider || (profileId.startsWith('kakao-') ? 'kakao' : profileId.startsWith('google-') ? 'google' : 'unknown'),
          nickname: nickname || '',
          email: email || '',
          realName: realName.trim(),
          contact: `${countryCode} ${contactLocal.trim()}`,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d?.error || '저장 실패'); return; }
      setMsg('저장되었습니다.');
      const saved = { realName: realName.trim(), contact: `${countryCode} ${contactLocal.trim()}` };
      onSaved?.(saved);
      // 전역 브로드캐스트 — 다른 화면(예약자 정보 pill, SubHeader 배지 등) 동기화
      try { window.dispatchEvent(new CustomEvent('kcis-profile-updated', { detail: saved })); } catch {}
      setTimeout(() => onClose(), 400);
    } catch {
      setMsg('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const joinDateStr = firstLoginAt ? new Date(firstLoginAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? 0 : '1rem',
      }}
    >
      <div
        role="dialog"
        aria-label="내 정보 수정"
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 520,
          maxHeight: isMobile ? '92vh' : '90vh',
          background: '#fff',
          borderRadius: isMobile ? '18px 18px 0 0' : 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: isMobile ? '1rem 1rem' : '1rem 1.25rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>내 정보 수정</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: 'none', border: 'none',
              fontSize: '1.2rem', cursor: 'pointer',
              color: 'var(--color-ink-2)',
              minWidth: 40, minHeight: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8,
            }}
          >✕</button>
        </div>

        <div style={{ padding: isMobile ? '1rem' : '1rem 1.25rem', overflowY: 'auto', display: 'grid', gap: '1rem' }}>
          <div style={{ padding: '0.65rem 0.85rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid var(--color-surface-border)', display: 'grid', gap: '0.3rem', fontSize: '0.85rem' }}>
            <div><span style={{ color: 'var(--color-ink-2)', fontWeight: 700, minWidth: '4rem', display: 'inline-block' }}>가입일자</span> <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{loading ? '…' : (joinDateStr || '(기록 없음)')}</span></div>
            {email && <div><span style={{ color: 'var(--color-ink-2)', fontWeight: 700, minWidth: '4rem', display: 'inline-block' }}>이메일</span> <span style={{ color: 'var(--color-ink-2)' }}>{email}</span></div>}
          </div>

          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="profile-realname" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)' }}>실명</label>
            <input
              id="profile-realname"
              type="text"
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              placeholder="실명을 입력하세요"
              style={{ padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.95rem', minHeight: 48 }}
            />
          </div>

          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <label htmlFor="profile-contact" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)' }}>연락처</label>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '100px 1fr' : '110px 1fr', gap: '0.45rem' }}>
              <select
                aria-label="국가코드"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                style={{ padding: '0.75rem 0.5rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.9rem', minHeight: 48, background: '#fff' }}
              >
                {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
              <input
                id="profile-contact"
                type="text"
                value={contactLocal}
                onChange={(e) => setContactLocal(e.target.value)}
                placeholder="1234-5678"
                inputMode="numeric"
                style={{ padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.95rem', minHeight: 48 }}
              />
            </div>
          </div>

          {msg && <p style={{ margin: 0, fontSize: '0.82rem', color: msg.includes('저장되었습니다') ? 'var(--color-primary-deep)' : '#b91c1c', fontWeight: 700 }}>{msg}</p>}
        </div>

        <div style={{
          padding: isMobile ? '0.85rem 1rem 1.5rem' : '0.85rem 1.25rem',
          borderTop: '1px solid var(--color-surface-border)',
          display: 'flex',
          flexDirection: isMobile ? 'column-reverse' : 'row',
          justifyContent: isMobile ? 'stretch' : 'flex-end',
          gap: '0.5rem',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 12,
              border: '1px solid var(--color-gray)',
              background: '#fff',
              color: 'var(--color-ink-2)',
              fontWeight: 700,
              fontSize: '0.95rem',
              minHeight: 48,
              cursor: 'pointer',
            }}
          >닫기</button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: '0.75rem 1.4rem',
              borderRadius: 12,
              border: 'none',
              background: saving ? '#9CA3AF' : 'var(--color-primary)',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.95rem',
              minHeight: 48,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
