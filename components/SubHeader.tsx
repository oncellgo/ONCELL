import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';
import ProfileModal from './ProfileModal';

/**
 * 하위(서브) 페이지 공통 헤더.
 * 랜딩 외 페이지에서 일관된 상단 바 + 네비게이션을 제공합니다.
 * - SSR prop + localStorage fallback으로 로그인 상태 유지.
 * - 네비 링크에 profileId/nickname/email 자동 부착.
 */
export type SubHeaderProps = {
  rightExtras?: ReactNode;
  profileId?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  email?: string | null;
  systemAdminHref?: string | null;
};

const NAV_ITEMS: Array<{ label: string; href: string; requireLogin?: boolean }> = [
  { label: '장소예약', href: '/reservation', requireLogin: true },
  { label: '예배 및 모임교안', href: '/cell-teaching', requireLogin: true },
  { label: '큐티', href: '/qt', requireLogin: true },
  { label: '말씀통독', href: '/reading', requireLogin: true },
];

const SubHeader = ({ rightExtras, profileId, displayName, nickname, email, systemAdminHref }: SubHeaderProps) => {
  const router = useRouter();
  const currentPath = router?.pathname || '';
  const isMobile = useIsMobile();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(displayName || null);

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

  const providerLabel = effProfileId?.startsWith('kakao-') ? '카카오 사용자' : effProfileId?.startsWith('google-') ? 'Google 사용자' : '사용자';
  const userLabel = currentDisplayName || displayName || effNickname || (effEmail ? effEmail.split('@')[0] : providerLabel);

  const authQs = effProfileId
    ? new URLSearchParams({
        profileId: effProfileId,
        ...(effNickname ? { nickname: effNickname } : {}),
        ...(effEmail ? { email: effEmail } : {}),
      }).toString()
    : '';

  const withAuth = (href: string) => {
    if (!authQs || href === '#' || href.startsWith('http')) return href;
    const sep = href.includes('?') ? '&' : '?';
    return `${href}${sep}${authQs}`;
  };

  const isActive = (href: string) => {
    if (href === '#') return false;
    if (href === '/') return currentPath === '/';
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: isMobile ? '0.4rem' : '0.75rem',
        padding: isMobile ? '0.5rem 0.55rem' : '0.7rem 1rem',
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'saturate(180%) blur(10px)',
        borderBottom: '1px solid var(--color-surface-border)',
        flexWrap: 'nowrap',
      }}
    >
      <Link
        href={withAuth('/')}
        aria-label="홈으로"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.55rem',
          textDecoration: 'none',
          color: 'var(--color-ink)',
          flex: '0 0 auto',
        }}
      >
        <img
          src="/images/kcis%20logo.png"
          alt="KCIS"
          style={{ width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, objectFit: 'contain' }}
        />
        {!isMobile && (
          <strong style={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: '1rem' }}>KCIS</strong>
        )}
      </Link>

      <nav
        className="nav-scroll"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '0.1rem' : '0.25rem',
          flex: '1 1 auto',
          minWidth: 0,
          justifyContent: 'center',
          flexWrap: 'nowrap',
          overflowX: 'auto',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              href={withAuth(item.href)}
              data-compact
              style={{
                padding: isMobile ? '0.35rem 0.65rem' : '0.4rem 0.85rem',
                borderRadius: 999,
                fontSize: isMobile ? '0.82rem' : '0.88rem',
                fontWeight: active ? 800 : 600,
                color: active ? 'var(--color-primary-deep)' : 'var(--color-ink-2)',
                background: active ? 'var(--color-primary-tint)' : 'transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flex: '0 0 auto' }}>
        {effProfileId && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.7rem',
              borderRadius: 999,
              background: 'var(--color-surface-muted)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-ink)',
              fontWeight: 700,
              fontSize: '0.82rem',
              maxWidth: isMobile ? 80 : 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              title="내 정보 수정"
              style={{ background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'var(--color-gray)' }}
            >{userLabel}</button>
            {systemAdminHref && (
              <Link
                href={systemAdminHref}
                aria-label="시스템 설정"
                title="시스템 설정"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  background: 'var(--color-primary-tint)',
                  color: 'var(--color-primary-deep)',
                  textDecoration: 'none',
                  marginLeft: '0.1rem',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
            )}
          </span>
        )}
        {effProfileId && (
          <button
            type="button"
            aria-label="로그아웃"
            title="로그아웃"
            onClick={() => {
              try {
                window.localStorage.removeItem('kcisProfileId');
                window.localStorage.removeItem('kcisNickname');
                window.localStorage.removeItem('kcisEmail');
              } catch {}
              window.location.href = '/';
            }}
            style={{
              padding: isMobile ? '0.35rem 0.6rem' : '0.4rem 0.8rem',
              borderRadius: 999,
              border: '1px solid var(--color-surface-border)',
              background: '#fff',
              color: 'var(--color-ink-2)',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '0 0 auto',
            }}
          >
            로그아웃
          </button>
        )}
        {rightExtras}
      </div>

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
    </header>
  );
};

export default SubHeader;
