import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const ProfileModal = ({ profileId, email, onClose }: Props) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [firstLoginAt, setFirstLoginAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // 회원 탈퇴 — '회원 탈퇴하기' 링크 클릭 시 바로 최종 확인 모달 표시.
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);

  const doWithdraw = async () => {
    setFinalConfirmOpen(false);
    setWithdrawing(true); setWithdrawMsg(null);
    try {
      const res = await fetch('/api/profile/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWithdrawMsg(d?.error === 'blocked' ? '차단된 계정은 탈퇴 처리할 수 없습니다.' : (d?.error || '탈퇴 실패'));
        return;
      }
      // 로컬 인증 정보 제거 후 홈으로
      try {
        window.localStorage.removeItem('kcisProfileId');
        window.localStorage.removeItem('kcisNickname');
        window.localStorage.removeItem('kcisEmail');
        window.localStorage.removeItem('kcisSystemAdminHref');
      } catch {}
      window.location.href = '/';
    } catch {
      setWithdrawMsg('탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setWithdrawing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/profile?profileId=${encodeURIComponent(profileId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setFirstLoginAt(d?.firstLoginAt || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId]);

  const joinDateStr = firstLoginAt ? new Date(firstLoginAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        role="dialog"
        aria-label="내 정보"
        className="modal-card"
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: isMobile ? '1rem 1rem' : '1rem 1.25rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-ink)' }}>{t('page.profile.title')}</h3>
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
            <div><span style={{ color: 'var(--color-ink-2)', fontWeight: 700, minWidth: '4rem', display: 'inline-block' }}>{t('page.profile.joinDate')}</span> <span style={{ color: 'var(--color-ink)', fontWeight: 700 }}>{loading ? '…' : (joinDateStr || '-')}</span></div>
            {email && <div><span style={{ color: 'var(--color-ink-2)', fontWeight: 700, minWidth: '4rem', display: 'inline-block' }}>{t('page.profile.email')}</span> <span style={{ color: 'var(--color-ink-2)' }}>{email}</span></div>}
          </div>

          {/* 회원 탈퇴 링크 — 클릭 시 바로 최종 확인 모달 */}
          <div style={{ marginTop: '0.5rem', borderTop: '1px dashed var(--color-gray)', paddingTop: '0.85rem' }}>
            <button
              type="button"
              onClick={() => { setWithdrawMsg(null); setFinalConfirmOpen(true); }}
              disabled={withdrawing}
              style={{ background: 'none', border: 'none', padding: 0, cursor: withdrawing ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 700, color: '#B91C1C', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span aria-hidden>⚠️</span>
              <span>{withdrawing ? t('page.profile.withdraw') + '…' : t('page.profile.withdraw')}</span>
            </button>
            {withdrawMsg && <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: '#B91C1C', fontWeight: 700 }}>{withdrawMsg}</p>}
          </div>
        </div>

        <div style={{
          padding: isMobile ? '0.85rem 1rem 1.5rem' : '0.85rem 1.25rem',
          borderTop: '1px solid var(--color-surface-border)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.75rem 1.2rem',
              borderRadius: 12,
              border: '1px solid var(--color-gray)',
              background: '#fff',
              color: 'var(--color-ink-2)',
              fontWeight: 700,
              fontSize: '0.95rem',
              minHeight: 48,
              cursor: 'pointer',
            }}
          >{t('page.profile.close')}</button>
        </div>
      </div>

      {/* 최종 탈퇴 확인 모달 — ProfileModal 위에 겹쳐서 표시 */}
      {finalConfirmOpen && (
        <div
          role="dialog"
          aria-label="회원 탈퇴 최종 확인"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={(e) => { if (e.target === e.currentTarget) setFinalConfirmOpen(false); }}
        >
          <div
            style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '2px solid #B91C1C' }}
          >
            <div style={{ padding: '1.1rem 1.25rem', background: '#FEF2F2', borderBottom: '1px solid #FCA5A5' }}>
              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                <span aria-hidden style={{ fontSize: '1.6rem', lineHeight: 1 }}>🚨</span>
                <div style={{ display: 'grid', gap: '0.2rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#7F1D1D' }}>탈퇴 전 꼭 확인해 주세요</h3>
                  <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 600, color: '#991B1B', lineHeight: 1.5 }}>
                    탈퇴 시 아래의 모든 정보가 <strong>즉시 삭제</strong>되며 <strong>복구가 불가능</strong>합니다.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'grid', gap: '0.65rem' }}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.55rem' }}>
                {[
                  { title: '장소 예약 정보 삭제', body: '현재 신청 중이거나 이용 완료된 모든 예약 내역이 삭제됩니다.' },
                  { title: '나의 기록 삭제', body: '그 동안 작성한 나의 큐티 기록 및 성경통독 진행 데이터가 모두 파기됩니다. (탈퇴 후에는 어떤 방법으로도 복구할 수 없습니다.)' },
                  { title: '개인정보 파기', body: '이름, 연락처 등 모든 개인 식별 정보가 즉시 삭제됩니다.' },
                  { title: '소셜 연동 해제', body: "사이트 탈퇴 후에도 카카오/구글 설정 내 '연결된 앱'에 기록이 남아있을 수 있으니, 해당 플랫폼에서 직접 연동 해제를 권장합니다." },
                ].map((item, i) => (
                  <li key={i} style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', padding: '0.65rem 0.8rem', background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA' }}>
                    <span aria-hidden style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 999, background: '#B91C1C', color: '#fff', fontSize: '0.76rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
                    <div style={{ display: 'grid', gap: '0.2rem', minWidth: 0 }}>
                      <strong style={{ fontSize: '0.88rem', color: '#7F1D1D', fontWeight: 800 }}>{item.title}</strong>
                      <span style={{ fontSize: '0.82rem', color: '#4B5563', lineHeight: 1.6, wordBreak: 'keep-all' }}>{item.body}</span>
                    </div>
                  </li>
                ))}
              </ul>

              <p style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', color: '#7F1D1D', fontWeight: 800, textAlign: 'center', lineHeight: 1.5 }}>
                삭제되는 데이터에 동의하며 탈퇴하시겠습니까?
              </p>
            </div>

            <div style={{ padding: '0.85rem 1.25rem 1rem', borderTop: '1px solid var(--color-surface-border)', display: 'flex', gap: '0.5rem', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
              <button
                type="button"
                onClick={() => setFinalConfirmOpen(false)}
                style={{ padding: '0.75rem 1.2rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.95rem', minHeight: 48, cursor: 'pointer' }}
              >취소</button>
              <button
                type="button"
                onClick={doWithdraw}
                style={{ padding: '0.75rem 1.2rem', borderRadius: 10, border: 'none', background: '#B91C1C', color: '#fff', fontWeight: 800, fontSize: '0.95rem', minHeight: 48, cursor: 'pointer' }}
              >탈퇴하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileModal;
