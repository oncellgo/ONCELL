import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../lib/useIsMobile';

const BottomNav = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const profileId = typeof router.query.profileId === 'string' ? router.query.profileId : undefined;
  const communityId = typeof router.query.communityId === 'string' ? router.query.communityId : undefined;
  const nickname = typeof router.query.nickname === 'string' ? router.query.nickname : undefined;
  const email = typeof router.query.email === 'string' ? router.query.email : undefined;
  const isAdmin = router.query.isAdmin === '1';

  if (!profileId) {
    return null;
  }
  if (router.pathname === '/') {
    return null;
  }
  if (router.pathname === '/dashboard' && !communityId) {
    return null;
  }

  const homeParams = new URLSearchParams();
  homeParams.set('profileId', profileId);
  if (nickname) homeParams.set('nickname', nickname);
  if (email) homeParams.set('email', email);
  const homeHref = `/dashboard?${homeParams.toString()}`;

  const communityParams = new URLSearchParams(homeParams);
  if (communityId) communityParams.set('communityId', communityId);
  if (isAdmin) communityParams.set('isAdmin', '1');
  const communityScope = communityParams.toString();

  const inCommunity = Boolean(communityId);
  const qtHref = `/qt/notes?${inCommunity ? communityScope : homeParams.toString()}`;

  const items = inCommunity
    ? [
        { label: t('bottom.communityMain'), href: `/dashboard?${communityScope}` },
        { label: t('bottom.schedule'), href: `/dashboard?${communityScope}#notice` },
        { label: t('bottom.worship'), href: `/dashboard?${communityScope}#worship` },
        { label: t('bottom.qt'), href: qtHref },
        { label: t('bottom.bible'), href: `/dashboard?${communityScope}#bible` },
        ...(isAdmin ? [{ label: t('bottom.settings'), href: `/management?${communityScope}` }] : []),
      ]
    : [
        { label: t('bottom.main'), href: homeHref },
        { label: t('bottom.qt'), href: qtHref },
        { label: t('bottom.myCommunity'), href: `/dashboard?${communityScope}#community` },
      ];

  return (
    <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, padding: isMobile ? '0.45rem 0.5rem 0.25rem' : '0.65rem 0.85rem 0.3rem', background: 'var(--color-ink)', boxShadow: '0 -16px 32px rgba(24, 37, 39, 0.18)', borderTop: '1px solid rgba(32, 205, 141, 0.2)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: 1040, margin: '0 auto', display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: isMobile ? '0.3rem' : '0.5rem' }}>
        {items.map((item) => {
          const itemPath = item.href.split('?')[0];
          const itemHash = item.href.includes('#') ? `#${item.href.split('#')[1]}` : '';
          const currentHash = typeof window !== 'undefined' ? window.location.hash : '';
          const pathMatch = router.pathname === itemPath;
          const isActive = itemHash
            ? pathMatch && currentHash === itemHash
            : pathMatch && (router.pathname === '/management' || (router.pathname === '/dashboard' && !currentHash) || router.pathname === '/qt/notes');
          return (
            <Link
              key={item.label}
              href={item.href}
              style={{
                display: 'inline-flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: isMobile ? '0.55rem 0.2rem' : '0.8rem 0.4rem',
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'var(--color-primary)' : '#ffffff',
                color: isActive ? '#ffffff' : 'var(--color-ink)',
                border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-gray)',
                textDecoration: 'none',
                fontWeight: isActive ? 800 : 700,
                fontSize: isMobile ? '0.74rem' : '0.9rem',
                boxShadow: isActive ? '0 2px 8px rgba(32, 205, 141, 0.35)' : 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                lineHeight: 1.15,
                textAlign: 'center',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <div style={{ width: '100%', maxWidth: 1040, margin: '0.25rem auto 0', display: 'flex', justifyContent: 'flex-end', paddingRight: '0.25rem' }}>
        <span style={{ fontSize: '0.68rem', color: 'rgba(255, 255, 255, 0.55)', fontWeight: 600, letterSpacing: '0.02em' }}>
          KCIS
        </span>
      </div>
    </nav>
  );
};

export default BottomNav;
