import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';
import ProfileModal from './ProfileModal';
import MenuBar from './MenuBar';
import LanguageSwitcher from './LanguageSwitcher';

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

const SubHeader = ({ rightExtras, profileId, displayName, nickname, email, systemAdminHref }: SubHeaderProps) => {
  const router = useRouter();
  const currentPath = router?.pathname || '';
  const isMobile = useIsMobile();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(displayName || null);

  const [lsProfileId, setLsProfileId] = useState<string | null>(null);
  const [lsNickname, setLsNickname] = useState<string | null>(null);
  const [lsEmail, setLsEmail] = useState<string | null>(null);
  const [lsAdminHref, setLsAdminHref] = useState<string | null>(null);
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
      // systemAdminHref 캐싱/복원 — SSR 프롭이 null이면 localStorage에서 꺼냄
      if (systemAdminHref) {
        window.localStorage.setItem('kcisSystemAdminHref', systemAdminHref);
      } else {
        const s = window.localStorage.getItem('kcisSystemAdminHref');
        if (s) setLsAdminHref(s);
      }
    } catch {}
  }, [profileId, nickname, email, systemAdminHref]);

  const effProfileId = profileId || lsProfileId;
  const effNickname = nickname || lsNickname;
  const effEmail = email || lsEmail;
  const effAdminHref = systemAdminHref || lsAdminHref;

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
    <>
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
        background: '#ffffff',
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
        <strong style={{ fontWeight: 800, letterSpacing: '0.02em', fontSize: isMobile ? '0.88rem' : '1rem', color: '#0B3A2B' }}>KCIS</strong>
      </Link>

      <div style={{ flex: '1 1 auto', minWidth: 0 }} />

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flex: '0 0 auto' }}>
        {effProfileId && (
          <Link
            href={withAuth('/dashboard')}
            title="내 대시보드"
            aria-label="내 대시보드"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              minHeight: 40,
              minWidth: isMobile ? 40 : undefined,
              padding: isMobile ? '0.35rem 0.55rem' : '0.35rem 0.7rem',
              borderRadius: 999,
              background: 'var(--color-primary-tint)',
              border: '1px solid var(--color-primary-tint)',
              color: 'var(--color-primary-deep)',
              fontWeight: 800,
              fontSize: isMobile ? '0.9rem' : '0.82rem',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              justifyContent: 'center',
            }}
          >
            <span aria-hidden>📊</span>
            {!isMobile && <span>내 대시보드</span>}
          </Link>
        )}
        {effProfileId && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              minHeight: 40,
              padding: isMobile ? '0.35rem 0.6rem' : '0.35rem 0.7rem',
              borderRadius: 999,
              background: 'var(--color-surface-muted)',
              border: '1px solid var(--color-surface-border)',
              color: 'var(--color-ink)',
              fontWeight: 700,
              fontSize: isMobile ? '0.8rem' : '0.82rem',
              maxWidth: isMobile ? 110 : 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              title="내 정보"
              aria-label="내 정보"
              style={{ background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'var(--color-gray)' }}
            >{userLabel}</button>
            {effAdminHref && (
              <Link
                href={effAdminHref}
                aria-label="시스템 설정"
                title="시스템 설정"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: 'var(--color-primary-tint)',
                  color: 'var(--color-primary-deep)',
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                window.localStorage.removeItem('kcisSystemAdminHref');
                window.localStorage.removeItem('kcisNickname');
                window.localStorage.removeItem('kcisEmail');
              } catch {}
              window.location.href = '/';
            }}
            style={{
              minHeight: 40,
              padding: isMobile ? '0.5rem 0.85rem' : '0.55rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 700,
              fontSize: isMobile ? '0.82rem' : '0.88rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '0 0 auto',
            }}
          >
            로그아웃
          </button>
        )}
        <LanguageSwitcher />
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
    <MenuBar profileId={effProfileId} nickname={effNickname} email={effEmail} />
    </>
  );
};

export default SubHeader;
