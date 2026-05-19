import { ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';
import LanguageSwitcher from './LanguageSwitcher';
import ProfileModal from './ProfileModal';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 공통 상단 네비게이션. 모든 페이지(랜딩 포함)에서 동일한 디자인으로 사용됩니다.
 * 배경: 다크 글래스 (rgba(20,28,48,0.72) + blur) — 그레이블루 격자 배경과 자연스럽게 어우러짐.
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
  const router = useRouter();
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
    <div style={{ padding: isMobile ? '0.5rem 0.5rem 0' : '0.75rem 0.75rem 0', maxWidth: 1040, margin: '0 auto', width: '100%' }}>
    <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'grid', gap: '0.35rem' }}>
    <style>{`
      .kcis-brand { display: inline-flex; }
      .kcis-brand span {
        display: inline-block;
        color: #06B6D4;
        animation: kcisBrandLight 5s ease-in-out infinite;
      }
      .kcis-brand span:nth-child(1) { animation-delay: 0s; }
      .kcis-brand span:nth-child(2) { animation-delay: 0.16s; }
      .kcis-brand span:nth-child(3) { animation-delay: 0.32s; }
      .kcis-brand span:nth-child(4) { animation-delay: 0.48s; }
      .kcis-brand span:nth-child(5) { animation-delay: 0.64s; }
      .kcis-brand span:nth-child(6) { animation-delay: 0.80s; }
      @keyframes kcisBrandLight {
        0%, 100% { color: #06B6D4; text-shadow: 0 0 2px rgba(6,182,212,0.35); }
        40% { color: #67E8F9; text-shadow: 0 0 4px rgba(103,232,249,0.55); }
        72%, 76% { color: #F9A8D4; text-shadow: 0 0 3px rgba(249,168,212,0.45); }
        85% { color: #67E8F9; text-shadow: 0 0 3px rgba(103,232,249,0.4); }
      }
      .logo-swap { position: relative; display: inline-block; flex-shrink: 0; }
      .logo-swap img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      .logo-swap img:nth-child(1) { animation: logoSwapA 7s ease-in-out infinite; }
      .logo-swap img:nth-child(2) { animation: logoSwapB 7s ease-in-out infinite; }
      @keyframes logoSwapA { 0%, 42% { opacity: 1; } 50%, 92% { opacity: 0; } 100% { opacity: 1; } }
      @keyframes logoSwapB { 0%, 42% { opacity: 0; } 50%, 92% { opacity: 1; } 100% { opacity: 0; } }
      @media (prefers-reduced-motion: reduce) {
        .kcis-brand span { animation: none; color: #06B6D4; }
        .logo-swap img { animation: none; }
        .logo-swap img:nth-child(2) { opacity: 0; }
      }
      .topnav-btn {
        display: inline-flex; align-items: center; gap: 0.25rem;
        padding: 0.3rem 0.65rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.14);
        color: rgba(255,255,255,0.88);
        font-weight: 600;
        font-size: 0.82rem;
        text-decoration: none;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background 0.15s ease, border-color 0.15s ease;
        cursor: pointer;
        font-family: inherit;
      }
      .topnav-btn:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.24); }
      .topnav-userbtn {
        background: none; border: none; padding: 0; margin: 0;
        font: inherit; color: rgba(255,255,255,0.82); cursor: pointer;
        text-decoration: underline; text-underline-offset: 3px;
        text-decoration-color: rgba(255,255,255,0.3);
        font-size: 0.82rem; font-weight: 600; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis; max-width: 110px;
      }
      .topnav-gear {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 999px;
        background: rgba(255,255,255,0.10);
        color: rgba(255,255,255,0.6);
        border: 1px solid rgba(255,255,255,0.15);
        padding: 0; cursor: pointer;
        margin-left: 0.1rem;
        flex-shrink: 0;
      }
      .topnav-gear:hover { background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); }
      .topnav-admin-btn {
        color: #BEF264;
        border-color: rgba(190,242,100,0.3);
        background: rgba(190,242,100,0.08);
      }
      .topnav-admin-btn:hover { background: rgba(190,242,100,0.15); border-color: rgba(190,242,100,0.45); }
    `}</style>
    <section style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: isMobile ? '0.35rem' : '0.5rem',
      flexWrap: 'nowrap',
      padding: isMobile ? '0.5rem 0.75rem' : '0.6rem 1rem',
      borderRadius: 14,
      background: 'rgba(20, 28, 48, 0.72)',
      border: '1px solid rgba(255,255,255,0.10)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
        <a href={homeHref} aria-label={t('brand.logoAlt')} title={t('brand.logoAlt')} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', textDecoration: 'none' }}>
          <span className="logo-swap" style={{ width: isMobile ? 56 : 64, height: isMobile ? 56 : 64 }}>
            <img src="/images/logo1.png" alt="ONCELL 로고" />
            <img src="/images/logo2.png" alt="" aria-hidden="true" />
          </span>
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
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: isMobile ? '0.3rem' : '0.45rem', flexWrap: 'nowrap', justifyContent: 'flex-end', flexShrink: 0 }}>
        {effProfileId && (
          <a
            href={dashboardHref}
            title="대시보드"
            className="topnav-btn"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>대시보드</span>
          </a>
        )}
        {/* 시스템 관리자 전용 진입 버튼 — admin 이 자주 쓰는 액션이라 1-클릭 유지 */}
        {effProfileId && systemAdminHref && (
          <a
            href={systemAdminHref}
            title={t('nav.sysSettings')}
            className="topnav-btn topnav-admin-btn"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>관리자</span>
          </a>
        )}
        {effProfileId && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              title="내 정보"
              aria-label="내 정보"
              className="topnav-userbtn"
            >{userLabel}</button>
            {/* 톱니 아이콘 — 모든 사용자에게 노출. 클릭 시 드롭다운 오픈.
                시스템 관리자는 드롭다운 안에 '시스템 관리자' 메뉴 자동 노출. */}
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              aria-label="계정 설정"
              title="계정 설정"
              className="topnav-gear"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </span>
        )}
        {/* 로그인 상태일 땐 로그아웃 버튼 숨김 — ProfileModal(닉네임 클릭)의 primary 액션으로 이전. */}
        {!effProfileId && (
          <a
            href="/auth/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 40,
              padding: isMobile ? '0.45rem 0.9rem' : '0.5rem 1.1rem',
              borderRadius: 999,
              background: 'var(--color-primary)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: isMobile ? '0.82rem' : '0.88rem',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
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
        padding: isMobile ? '0.4rem 0.75rem' : '0.45rem 1rem',
        borderRadius: 14,
        background: adminAccent ? 'rgba(190,242,100,0.12)' : 'rgba(32,205,141,0.10)',
        border: `1px solid ${adminAccent ? 'rgba(190,242,100,0.28)' : 'rgba(32,205,141,0.22)'}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        {badge && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: isMobile ? '0.3rem 0.7rem' : '0.35rem 0.85rem',
            borderRadius: 999,
            background: adminAccent ? 'rgba(190,242,100,0.22)' : 'rgba(32,205,141,0.18)',
            color: adminAccent ? '#BEF264' : '#20CD8D',
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
    </div>
  );
};

export default TopNav;
