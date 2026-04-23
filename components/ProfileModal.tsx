import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../lib/useIsMobile';
import { getReadingPlan, setReadingPlan, type ReadingPlan } from '../lib/readingPreferences';

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

const ProfileModal = ({ profileId, nickname, email, onClose }: Props) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  // 회원 탈퇴 — '회원 탈퇴하기' 링크 클릭 시 바로 최종 확인 모달 표시.
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  // '⚙️ 설정' 접이식 — 이메일·탈퇴 등 가끔 쓰는 계정 메뉴 수납.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 통독 계획 — 1독/2독. null = 아직 미지정.
  const [readingPlan, setReadingPlanState] = useState<ReadingPlan | null>(null);
  useEffect(() => { setReadingPlanState(getReadingPlan()); }, []);
  const pickReadingPlan = (plan: ReadingPlan) => {
    setReadingPlan(plan);
    setReadingPlanState(plan);
  };

  // 로그아웃 — TopNav 에서 이전되어 이제 본 모달 primary 액션.
  const doLogout = () => {
    try {
      window.localStorage.removeItem('kcisProfileId');
      window.localStorage.removeItem('kcisNickname');
      window.localStorage.removeItem('kcisEmail');
      window.localStorage.removeItem('kcisSystemAdminHref');
    } catch {}
    window.location.href = '/';
  };

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
        setWithdrawMsg(d?.error === 'blocked' ? t('page.profile.withdrawBlocked') : (d?.error || t('page.profile.withdrawFail')));
        return;
      }
      // 로컬 인증 정보 + 묵상 초안 제거 후 홈으로
      try {
        window.localStorage.removeItem('kcisProfileId');
        window.localStorage.removeItem('kcisNickname');
        window.localStorage.removeItem('kcisEmail');
        window.localStorage.removeItem('kcisSystemAdminHref');
        // 로컬에 남아있는 QT 묵상 초안(`qt-reflection:{profileId}:{date}`) 도 모두 정리
        const prefix = `qt-reflection:${profileId}:`;
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(prefix)) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      } catch {}
      window.location.href = '/';
    } catch {
      setWithdrawMsg(t('page.profile.withdrawError'));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'transparent',
        zIndex: 100,
      }}
    >
      {/* 드롭다운 — TopNav 오른쪽에 표시되는 프로필 메뉴.
          모달 아님: 어두운 backdrop 없음, 크기 작음, 헤더/푸터 없음. */}
      <div
        role="dialog"
        aria-label={t('page.profile.title')}
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: isMobile ? 60 : 72,
          right: isMobile ? 8 : 16,
          width: `min(280px, calc(100vw - 16px))`,
          maxHeight: `calc(100vh - ${isMobile ? 72 : 88}px)`,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid var(--color-surface-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '0.4rem', overflowY: 'auto', display: 'grid', gap: '0.15rem' }}>
          {/* 로그아웃 — 메뉴 행 스타일 */}
          <button
            type="button"
            onClick={doLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.55rem',
              width: '100%',
              minHeight: 40,
              padding: '0.5rem 0.7rem',
              borderRadius: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-ink)',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary-tint)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>🚪</span>
            <span>{t('nav.logout')}</span>
          </button>

          {/* ⚙️ 설정 — 접이식 메뉴 행. 로그아웃과 동일 톤 */}
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            aria-label={t('page.profile.settingsAria')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
              width: '100%',
              minHeight: 40,
              padding: '0.5rem 0.7rem',
              borderRadius: 8,
              background: settingsOpen ? 'var(--color-primary-tint)' : 'transparent',
              border: 'none',
              color: 'var(--color-ink)',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { if (!settingsOpen) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary-tint)'; }}
            onMouseLeave={(e) => { if (!settingsOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
              <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>⚙️</span>
              <span>{t('page.profile.settings')}</span>
            </span>
            <span
              aria-hidden
              style={{
                fontSize: '0.82rem',
                color: 'var(--color-ink-2)',
                transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.18s ease',
                lineHeight: 1,
              }}
            >▾</span>
          </button>

          {settingsOpen && (
            <div style={{ padding: '0.5rem 0.7rem 0.2rem 2.15rem', display: 'grid', gap: '0.55rem', borderLeft: '2px solid var(--color-primary-tint)', marginLeft: '0.3rem' }}>
              {email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>
                  <span aria-hidden>📧</span>
                  <span style={{ wordBreak: 'break-all' }}>{email}</span>
                </div>
              )}

              {/* 통독 계획 — 1독/2독 */}
              <div style={{ display: 'grid', gap: '0.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', color: 'var(--color-ink)', fontWeight: 700 }}>
                  <span aria-hidden>📖</span>
                  <span>성경통독 계획</span>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {([
                    { value: 1 as ReadingPlan, label: '1독', sub: '하루 ≈ 3장' },
                    { value: 2 as ReadingPlan, label: '2독', sub: '하루 6-7장' },
                  ]).map(({ value, label, sub }) => {
                    const active = readingPlan === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => pickReadingPlan(value)}
                        style={{
                          flex: 1,
                          padding: '0.4rem 0.55rem',
                          borderRadius: 8,
                          border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-gray)'}`,
                          background: active ? 'var(--color-primary-tint)' : '#fff',
                          color: active ? 'var(--color-primary-deep)' : 'var(--color-ink-2)',
                          fontWeight: active ? 800 : 600,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'grid',
                          gap: '0.1rem',
                          textAlign: 'center',
                        }}
                      >
                        <span>{label}</span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 500, opacity: 0.75 }}>{sub}</span>
                      </button>
                    );
                  })}
                </div>
                {readingPlan && (
                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--color-ink-2)', lineHeight: 1.45 }}>
                    변경 시 오늘부터 분량이 바뀝니다. 과거 기록은 유지됩니다.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setWithdrawMsg(null); setFinalConfirmOpen(true); }}
                disabled={withdrawing}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  cursor: withdrawing ? 'not-allowed' : 'pointer',
                  fontSize: '0.82rem', fontWeight: 700, color: '#B91C1C',
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', alignSelf: 'flex-start',
                }}
              >
                <span aria-hidden>⚠️</span>
                <span>{withdrawing ? t('page.profile.withdraw') + '…' : t('page.profile.withdraw')}</span>
              </button>
              {withdrawMsg && <p style={{ margin: 0, fontSize: '0.8rem', color: '#B91C1C', fontWeight: 700 }}>{withdrawMsg}</p>}
            </div>
          )}
        </div>

      </div>

      {/* 최종 탈퇴 확인 모달 — ProfileModal 위에 겹쳐서 표시 */}
      {finalConfirmOpen && (
        <div
          role="dialog"
          aria-label={t('page.profile.confirmLabel')}
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
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#7F1D1D' }}>{t('page.withdraw.finalTitle')}</h3>
                  <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 600, color: '#991B1B', lineHeight: 1.5 }}>
                    {t('page.withdraw.finalSub')}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'grid', gap: '0.65rem' }}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.55rem' }}>
                {[
                  { title: t('page.withdraw.item1Title'), body: t('page.withdraw.item1Body') },
                  { title: t('page.withdraw.item2Title'), body: t('page.withdraw.item2Body') },
                  { title: t('page.withdraw.item3Title'), body: t('page.withdraw.item3Body') },
                  { title: t('page.withdraw.item4Title'), body: t('page.withdraw.item4Body') },
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

              {/* 탈퇴 전 나의 묵상 기록 다운로드 안내 — 기록은 복구 불가이므로 보관 유도 */}
              <div style={{ marginTop: '0.35rem', padding: '0.8rem 0.9rem', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A', display: 'grid', gap: '0.45rem' }}>
                <p style={{ margin: 0, fontWeight: 800, color: '#92400E', fontSize: '0.92rem', lineHeight: 1.4, wordBreak: 'keep-all' }}>
                  {t('page.profile.downloadTitle')}
                </p>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#78350F', lineHeight: 1.55, wordBreak: 'keep-all' }}>
                  {t('page.profile.downloadBody')}
                </p>
                <a
                  href={`/api/qt-notes-export?profileId=${encodeURIComponent(profileId)}${nickname ? `&nickname=${encodeURIComponent(nickname)}` : ''}`}
                  download
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: 40,
                    padding: '0.5rem 0.95rem',
                    borderRadius: 8,
                    background: '#FDE68A',
                    color: '#78350F',
                    border: '1px solid #FBBF24',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  {t('page.profile.downloadBtn')}
                </a>
              </div>

              <p style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', color: '#7F1D1D', fontWeight: 800, textAlign: 'center', lineHeight: 1.5 }}>
                {t('page.withdraw.agreeQ')}
              </p>
            </div>

            <div style={{ padding: '0.85rem 1.25rem 1rem', borderTop: '1px solid var(--color-surface-border)', display: 'flex', gap: '0.5rem', flexDirection: isMobile ? 'column-reverse' : 'row', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
              <button
                type="button"
                onClick={() => setFinalConfirmOpen(false)}
                style={{ padding: '0.75rem 1.2rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.95rem', minHeight: 48, cursor: 'pointer' }}
              >{t('page.withdraw.cancelBtn')}</button>
              <button
                type="button"
                onClick={doWithdraw}
                style={{ padding: '0.75rem 1.2rem', borderRadius: 10, border: 'none', background: '#B91C1C', color: '#fff', fontWeight: 800, fontSize: '0.95rem', minHeight: 48, cursor: 'pointer' }}
              >{t('page.withdraw.confirmBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileModal;
