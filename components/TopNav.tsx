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
      .kcis-brand { display: inline-flex; }
      .kcis-brand span {
        display: inline-block;
        color: #06B6D4;
        animation: kcisBrandLight 2s ease-in-out infinite;
      }
      .kcis-brand span:nth-child(1) { animation-delay: 0s; }
      .kcis-brand span:nth-child(2) { animation-delay: 0.16s; }
      .kcis-brand span:nth-child(3) { animation-delay: 0.32s; }
      .kcis-brand span:nth-child(4) { animation-delay: 0.48s; }
      .kcis-brand span:nth-child(5) { animation-delay: 0.64s; }
      .kcis-brand span:nth-child(6) { animation-delay: 0.80s; }
      @keyframes kcisBrandLight {
        0%, 100% { color: #06B6D4; text-shadow: 0 0 2px rgba(6,182,212,0.35); }
        50% { color: #67E8F9; text-shadow: 0 0 4px rgba(103,232,249,0.55); }
      }
      .kcis-logo { will-change: opacity, filter; animation: kcisLogoPulse 4.5s ease-in-out infinite; }
      @keyframes kcisLogoPulse {
        0%, 100% { opacity: 0.78; }
        40% { opacity: 0.92; }
        75% {
          opacity: 1;
          filter: brightness(1.18)
            drop-shadow(0 0 4px rgba(255, 255, 255, 0.85))
            drop-shadow(0 0 12px rgba(255, 255, 255, 0.55));
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .kcis-brand span { animation: none; color: #06B6D4; }
        .kcis-logo { animation: none; }
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
            src="/images/icon-192.png"
            alt="ONCELL 로고"
            className="kcis-logo"
            style={{ width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, objectFit: 'contain', display: 'inline-block', borderRadius: 6 }}
          />
          <strong style={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: isMobile ? '1rem' : '1.15rem' }}>
            <span className="kcis-brand" aria-label="ONCELL">
              <span aria-hidden>O</span>
              <span aria-hidden>N</span>
              <span aria-hidden>C</span>
              <span aria-hidden>E</span>
              <span aria-hidden>L</span>
              <span aria-hidden>L</span>
            </span>
          </strong>
        </a>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: isMobile ? '0.3rem' : '0.5rem', flexWrap: 'nowrap', justifyContent: 'flex-end', flexShrink: 0 }}>
        {effProfileId && (
          <a
            href={dashboardHref}
            title="대시보드"
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
            <span aria-hidden>📊</span><span>대시보드</span>
          </a>
        )}
        {/* 시스템 관리자 전용 진입 버튼 — admin 이 자주 쓰는 액션이라 1-클릭 유지 */}
        {effProfileId && systemAdminHref && (
          <a
            href={systemAdminHref}
            title={t('nav.sysSettings')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              padding: isMobile ? '0.3rem 0.55rem' : '0.35rem 0.75rem',
              borderRadius: 999,
              background: '#ECFCCB',
              border: '1px solid #D9F09E',
              color: '#3F6212',
              fontWeight: 800,
              fontSize: isMobile ? '0.78rem' : '0.85rem',
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            <span aria-hidden>🛠️</span><span>관리자</span>
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
            {/* 톱니 아이콘 — 모든 사용자에게 노출. 클릭 시 닉네임 클릭과 동일한 드롭다운 오픈.
                시스템 관리자는 드롭다운 안에 '🛠️ 시스템 관리자' 메뉴 자동 노출. */}
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              aria-label="계정 설정"
              title="계정 설정"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: 999,
                background: 'var(--color-primary-tint)', color: 'var(--color-primary-deep)',
                border: 'none', padding: 0, cursor: 'pointer',
                marginLeft: '0.1rem',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </span>
        )}
        {/* 로그인 상태일 땐 로그아웃 버튼 숨김 — ProfileModal(닉네임 클릭) 의 primary 액션으로 이전. */}
        {!effProfileId && (
          <a
            href="/auth/login"
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
            {t('nav.login')}
          </a>
        )}
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
