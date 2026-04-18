import Link from 'next/link';

type Props = {
  authQS: string;
  active?: 'users' | 'schedule' | 'bulletinTemplate' | 'venue' | 'etc' | null;
  defaultCommunityId?: string;
};

const AdminTabBar = ({ authQS, active = null, defaultCommunityId }: Props) => {
  const tabs = [
    { key: 'users', label: '사용자관리', href: `/admin/system?${authQS}` },
    { key: 'schedule', label: '일정관리', href: `/management?${authQS}${defaultCommunityId ? `&communityId=${encodeURIComponent(defaultCommunityId)}` : ''}&isAdmin=1&menu=${encodeURIComponent('일정관리')}` },
    { key: 'bulletinTemplate', label: '주보관리', href: `/admin/system?${authQS}&section=bulletinTemplate` },
    { key: 'venue', label: '장소관리', href: `/admin/system?${authQS}&section=venue` },
    { key: 'etc', label: '기타설정', href: `/admin/system?${authQS}&section=etc` },
  ] as const;

  return (
    <section style={{ position: 'sticky', top: 0, zIndex: 15, display: 'flex', gap: '0.4rem', flexWrap: 'wrap', padding: '0.55rem 0.75rem', borderRadius: 12, background: 'rgba(236, 252, 203, 0.92)', backdropFilter: 'saturate(180%) blur(10px)', border: '1px solid #D9F09E', alignItems: 'center' }}>
      <span style={{ padding: '0.3rem 0.75rem', borderRadius: 999, background: '#BEF264', color: '#3F6212', fontWeight: 800, fontSize: '0.85rem' }}>시스템 관리</span>
      {tabs.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            style={{
              padding: '0.5rem 1.05rem',
              borderRadius: 999,
              background: isActive ? '#65A30D' : '#ECFCCB',
              color: isActive ? '#F7FEE7' : '#4D7C0F',
              border: `1px solid ${isActive ? '#65A30D' : '#D9F09E'}`,
              fontWeight: 800,
              fontSize: '0.9rem',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
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
