import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

/**
 * 모든 사용자 페이지 상단에 공통으로 노출되는 메뉴 바.
 * 상단 브랜드/유저 바(`SubHeader`) 바로 아래에 sticky로 고정된다.
 *
 * 항목 순서는 CLAUDE.md / plan.md 규약:
 *   일정 · 장소예약 · 큐티 · 성경통독 · 주보 · 구역모임교안
 *
 * 로그인 상태이면 links 에 profileId/nickname/email 자동 부착.
 * 현재 route 와 일치하는 항목은 active 스타일.
 */
type Props = {
  profileId?: string | null;
  nickname?: string | null;
  email?: string | null;
};

const ITEMS: Array<{ label: string; href: string }> = [
  // 일정은 현재 숨김 (필요 시 아래 주석 해제)
  // { label: '일정', href: '/schedule' },
  { label: '장소예약', href: '/reservation' },
  { label: '큐티', href: '/qt' },
  { label: '성경통독', href: '/reading' },
  { label: '주보', href: '/sunday-worship' },
  { label: '구역모임교안', href: '/cell-teaching' },
];

const MenuBar = ({ profileId, nickname, email }: Props) => {
  const router = useRouter();
  const currentPath = router?.pathname || '';
  const isMobile = useIsMobile();

  // SSR props 가 없을 때를 대비한 localStorage fallback (Hydration-safe)
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

  // 클릭 시점의 최신 localStorage 기반으로 href 재구성 (hydration race 방지).
  // SSR/첫 렌더 중 링크가 auth 없이 이동되는 것을 막는다.
  const handleNavClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    let finalHref = href;
    try {
      const p = window.localStorage.getItem('kcisProfileId') || effProfileId || '';
      const n = window.localStorage.getItem('kcisNickname') || effNickname || '';
      const em = window.localStorage.getItem('kcisEmail') || effEmail || '';
      if (p) {
        const qs = new URLSearchParams({ profileId: p, ...(n ? { nickname: n } : {}), ...(em ? { email: em } : {}) }).toString();
        if (!href.includes('profileId=')) {
          const sep = href.includes('?') ? '&' : '?';
          finalHref = `${href}${sep}${qs}`;
        }
      }
    } catch {}
    if (finalHref !== href) {
      e.preventDefault();
      window.location.href = finalHref;
    }
  };

  const isActive = (href: string) => {
    if (href === '/') return currentPath === '/';
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  return (
    <nav
      className="nav-scroll"
      aria-label="메인 메뉴"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? '0.3rem' : '0.45rem',
        padding: isMobile ? '0.35rem 0.6rem' : '0.4rem 0.85rem',
        background: 'transparent',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 15,
      }}
    >
      {ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={withAuth(item.href)}
            onClick={handleNavClick(item.href)}
            data-compact
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '0.4rem 0.7rem' : '0.5rem 1rem',
              borderRadius: 999,
              background: active ? 'var(--color-primary)' : 'var(--color-primary-tint)',
              color: active ? '#fff' : 'var(--color-primary-deep)',
              border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-primary-tint)'}`,
              fontSize: isMobile ? '0.82rem' : '0.9rem',
              fontWeight: active ? 800 : 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: active ? '0 4px 10px rgba(32, 205, 141, 0.28)' : 'none',
              transition: 'background 0.15s ease, color 0.15s ease, transform 0.15s ease',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};

export default MenuBar;
