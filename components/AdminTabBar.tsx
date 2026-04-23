import Link from 'next/link';
import { useIsMobile } from '../lib/useIsMobile';

type Props = {
  authQS: string;
  active?: 'users' | 'schedule' | 'bulletinTemplate' | 'venue' | 'etc' | 'stats' | null;
  defaultCommunityId?: string;
};

const AdminTabBar = ({ authQS, active = null, defaultCommunityId }: Props) => {
  const isMobile = useIsMobile();
  const tabs = [
    { key: 'users', label: '사용자관리', href: `/admin/system?${authQS}` },
    { key: 'schedule', label: '일정관리', href: `/management?${authQS}${defaultCommunityId ? `&communityId=${encodeURIComponent(defaultCommunityId)}` : ''}&isAdmin=1&menu=${encodeURIComponent('일정관리')}` },
    // 주보관리는 hidden (필요 시 아래 주석 해제)
    // { key: 'bulletinTemplate', label: '주보관리', href: `/admin/system?${authQS}&section=bulletinTemplate` },
    { key: 'venue', label: '장소예약관리', href: `/admin/system?${authQS}&section=venue` },
    { key: 'stats', label: '통계관리', href: `/admin/system?${authQS}&section=stats` },
    { key: 'etc', label: '기타설정', href: `/admin/system?${authQS}&section=etc` },
  ] as const;

  return (
    <section
      className="nav-scroll"
      aria-label="시스템 관리 메뉴"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 15,
        display: 'flex',
        gap: isMobile ? '0.25rem' : '0.35rem',
        flexWrap: 'nowrap',
        padding: isMobile ? '0.3rem 0.45rem' : '0.35rem 0.55rem',
        borderRadius: 10,
        background: 'rgba(247, 254, 231, 0.92)',
        backdropFilter: 'saturate(160%) blur(8px)',
        border: '1px solid #D9F09E',
        alignItems: 'center',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {tabs.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            data-compact
            aria-current={isActive ? 'page' : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 34,
              padding: isMobile ? '0 0.65rem' : '0 0.9rem',
              borderRadius: 999,
              background: isActive ? '#65A30D' : 'transparent',
              color: isActive ? '#F7FEE7' : '#4D7C0F',
              border: `1px solid ${isActive ? '#65A30D' : 'transparent'}`,
              fontWeight: isActive ? 800 : 700,
              fontSize: isMobile ? '0.78rem' : '0.86rem',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: isActive ? '0 2px 6px rgba(101, 163, 13, 0.22)' : 'none',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </section>
  );
};

export default AdminTabBar;
