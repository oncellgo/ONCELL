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
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 15,
        display: 'flex',
        gap: isMobile ? '0.3rem' : '0.4rem',
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        padding: isMobile ? '0.45rem 0.55rem' : '0.55rem 0.75rem',
        borderRadius: 12,
        background: 'rgba(236, 252, 203, 0.92)',
        backdropFilter: 'saturate(180%) blur(10px)',
        border: '1px solid #D9F09E',
        alignItems: 'center',
        /* 스크롤바 숨김은 globals.css .nav-scroll 클래스에서 처리 */
      }}
    >
      <span style={{ padding: isMobile ? '0.28rem 0.55rem' : '0.3rem 0.75rem', minHeight: 40, display: 'inline-flex', alignItems: 'center', borderRadius: 999, background: '#BEF264', color: '#3F6212', fontWeight: 800, fontSize: isMobile ? '0.78rem' : '0.85rem', flexShrink: 0, whiteSpace: 'nowrap' }}>시스템 관리</span>
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
              minHeight: 40,
              padding: isMobile ? '0 0.75rem' : '0 1.05rem',
              borderRadius: 999,
              background: isActive ? '#65A30D' : '#ECFCCB',
              color: isActive ? '#F7FEE7' : '#4D7C0F',
              border: `1px solid ${isActive ? '#65A30D' : '#D9F09E'}`,
              fontWeight: 800,
              fontSize: isMobile ? '0.8rem' : '0.9rem',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: isActive ? '0 4px 12px rgba(101, 163, 13, 0.28)' : 'none',
              transition: 'background 0.15s ease, transform 0.15s ease',
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
