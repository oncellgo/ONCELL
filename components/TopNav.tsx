import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import ProfileModal from './ProfileModal';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 공통 상단 네비게이션. 모든 페이지(랜딩 포함)에서 동일한 디자인으로 사용됩니다.
 * 디자인 변경은 이 파일만 수정하면 전체에 반영됩니다.
 */
export type TopNavProps = {
  profileId: string | null;
  badge?: string;
  brandExtras?: ReactNode;
  displayName?: string | null;
  isAdmin?: boolean;
  systemAdminHref?: string;
  nickname?: string | null;
  email?: string | null;
  adminAccent?: boolean;
};

const TopNav = ({ profileId, badge, brandExtras, displayName, isAdmin, systemAdminHref, nickname, email, adminAccent }: TopNavProps) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [lsProfileId, setLsProfileId] = useState<string | null>(null);
  const [lsNickname, setLsNickname] = useState<string | null>(null);
  const [lsEmail, setLsEmail] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (!profileId) {
        const p = window.localStorage.getItem('kcisProfileId');
        if (p) setLsProfileId(p);
      }
      if (!nickname) {
        const n = window.localStorage.getItem('kcisNickname');
        if (n) setLsNickname(n);
      }
      if (!email) {
        const e = window.localStorage.getItem('kcisEmail');
        if (e) setLsEmail(e);
      }
    } catch {}
  }, [profileId, nickname, email]);
  const effProfileId = profileId || lsProfileId;
  const effNickname = nickname || lsNickname;
  const effEmail = email || lsEmail;
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(displayName || null);
  const authQs = effProfileId
    ? new URLSearchParams({
        profileId: effProfileId,
        ...(effNickname ? { nickname: effNickname } : {}),
        ...(effEmail ? { email: effEmail } : {}),
      }).toString()
    : '';
  const homeHref = effProfileId ? `/?${authQs}` : '/';
  const dashboardHref = effProfileId ? `/dashboard?${authQs}` : '/dashboard';
  const providerLabel = effProfileId?.startsWith('kakao-') ? '카카오 사용자' : effProfileId?.startsWith('google-') ? 'Google 사용자' : '사용자';
  const userLabel = currentDisplayName || displayName || effNickname || (effEmail ? effEmail.split('@')[0] : providerLabel);
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'grid', gap: '0.35rem' }}>
    <style>{`
      .kcis-brand { display: inline-block; color: #0B3A2B; text-shadow: none; }
      .kcis-logo { will-change: opacity, filter; animation: kcisLogoPulse 4.5s ease-in-out infinite; }
      @keyframes kcisLogoPulse {
        0%, 100% {
          opacity: 0.78;
        }
        40% {
          opacity: 0.92;
        }
        75% {
          opacity: 1;
          filter: brightness(1.18)
            drop-shadow(0 0 4px rgba(255, 255, 255, 0.85))
            drop-shadow(0 0 12px rgba(255, 255, 255, 0.55));
        }
      }
    `}</style>
    <section style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: isMobile ? '0.35rem' : '0.5rem',
      flexWrap: 'nowrap',
      padding: isMobile ? '0.5rem 0.65rem' : '0.6rem 0.9rem',
      borderRadius: 14,
      background: '#ffffff',
      border: '1px solid var(--color-gray)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
        <a href={homeHref} aria-label={t('brand.logoAlt')} title={t('brand.logoAlt')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }}>
          <img
            src="/images/kcis%20logo.png"
            alt="KCIS 로고"
            className="kcis-logo"
            style={{ width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, objectFit: 'contain', display: 'inline-block' }}
          />
          <strong style={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: isMobile ? '0.82rem' : '0.9rem' }}>
            <span className="kcis-brand">KCIS</span>
          </strong>
        </a>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: isMobile ? '0.3rem' : '0.5rem', flexWrap: 'nowrap', justifyContent: 'flex-end', flexShrink: 0 }}>
        {effProfileId && (
          <a
            href={dashboardHref}
            title="내 대시보드"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              padding: isMobile ? '0.3rem 0.55rem' : '0.35rem 0.75rem',
              borderRadius: 999,
              background: 'var(--color-primary-tint)',
              border: '1px solid var(--color-primary-tint)',
              color: 'var(--color-primary-deep)',
              fontWeight: 800,
              fontSize: isMobile ? '0.78rem' : '0.85rem',
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <span aria-hidden>📊</span><span>내 대시보드</span>
          </a>
        )}
        {effProfileId && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: isMobile ? '0.3rem 0.55rem' : '0.35rem 0.7rem',
            borderRadius: 999,
            background: 'var(--color-surface-muted)',
            border: '1px solid var(--color-surface-border)',
            color: '#182527',
            fontWeight: 700,
            fontSize: isMobile ? '0.82rem' : '0.9rem',
            maxWidth: isMobile ? 130 : 'none',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              title="내 정보"
              aria-label="내 정보"
              style={{ background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'var(--color-gray)' }}
            >{userLabel}</button>
            {systemAdminHref && (
              <a href={systemAdminHref} aria-label={t('nav.sysSettings')} title={t('nav.sysSettings')} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 999,
                background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)',
                textDecoration: 'none', marginLeft: '0.1rem',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </a>
            )}
          </span>
        )}
        <a
          href={effProfileId ? '/' : '/auth/login'}
          onClick={(e) => {
            if (effProfileId) {
              e.preventDefault();
              try {
                window.localStorage.removeItem('kcisProfileId');
                window.localStorage.removeItem('kcisNickname');
                window.localStorage.removeItem('kcisEmail');
              } catch {}
              window.location.href = '/';
            }
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            padding: isMobile ? '0.5rem 0.9rem' : '0.6rem 1.1rem',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: isMobile ? '0.82rem' : '0.9rem',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {effProfileId ? t('nav.logout') : t('nav.login')}
        </a>
        <LanguageSwitcher />
      </div>
    </section>
    {(badge || brandExtras) && (
      <section className="nav-scroll" style={{
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? '0.45rem' : '0.6rem',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        padding: isMobile ? '0.4rem 0.65rem' : '0.45rem 0.9rem',
        borderRadius: 14,
        background: adminAccent ? '#ECFCCB' : '#CCF4E5',
        border: `1px solid ${adminAccent ? '#D9F09E' : '#E7F3EE'}`,
      }}>
        {badge && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: isMobile ? '0.3rem 0.7rem' : '0.35rem 0.85rem',
            borderRadius: 999,
            background: adminAccent ? '#BEF264' : 'var(--color-primary-tint)',
            color: adminAccent ? '#3F6212' : 'var(--color-primary-deep)',
            fontWeight: 800,
            fontSize: isMobile ? '0.85rem' : '0.92rem',
          }}>
            {badge}
          </span>
        )}
        {brandExtras && (
          <div style={{ flex: 1, minWidth: 0 }}>{brandExtras}</div>
        )}
      </section>
    )}

    {profileModalOpen && effProfileId && (
      <ProfileModal
        profileId={effProfileId}
        nickname={effNickname}
        email={effEmail}
        initialRealName={currentDisplayName || displayName || null}
        onClose={() => setProfileModalOpen(false)}
        onSaved={(next) => setCurrentDisplayName(next.realName)}
      />
    )}
    </div>
  );
};

export default TopNav;
