import { useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';

type Community = {
  id: string;
  name: string;
  isAdmin: boolean;
};

export type CommunityBadgeProps = {
  profileId: string | null;
  communityId: string | null;
  joinedCommunities: Community[];
  /** URL에 유지할 추가 쿼리 (nickname, email 등) */
  preserveQuery?: Record<string, string | undefined>;
};

const CommunityBadge = ({ profileId, communityId, joinedCommunities, preserveQuery }: CommunityBadgeProps) => {
  const router = useRouter();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = joinedCommunities.find((c) => c.id === communityId) || null;
  if (!active) return null;

  const switchTo = (id: string) => {
    setOpen(false);
    const target = joinedCommunities.find((c) => c.id === id);
    const params: Record<string, string> = {};
    if (profileId) params.profileId = profileId;
    if (preserveQuery) {
      Object.entries(preserveQuery).forEach(([k, v]) => { if (typeof v === 'string') params[k] = v; });
    }
    params.communityId = id;
    if (target?.isAdmin) params.isAdmin = '1';
    router.push({ pathname: router.pathname, query: params });
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="공동체 전환"
          title="현재 선택된 공동체 · 클릭해서 전환"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.45rem 0.95rem',
            borderRadius: 999,
            border: 'none',
            background: '#CCF4E5',
            color: '#3F6212',
            fontWeight: 800,
            fontSize: '1.02rem',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(132, 204, 22, 0.25)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{active.name}</span>
          <span style={{ padding: '0.1rem 0.5rem', borderRadius: 999, background: '#ffffff', color: 'var(--color-ink)', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.02em', border: '1px solid var(--color-gray)' }}>
            {active.isAdmin ? '관리자' : '일반회원'}
          </span>
          <span style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease', fontSize: '1.1rem', lineHeight: 1 }}>▾</span>
        </button>
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
            <ul style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: 220,
              zIndex: 40,
              margin: 0,
              padding: '0.35rem',
              listStyle: 'none',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-gray)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-card)',
              maxHeight: 320,
              overflowY: 'auto',
            }}>
              {joinedCommunities.map((community) => {
                const isActive = community.id === communityId;
                return (
                  <li key={community.id}>
                    <button
                      type="button"
                      onClick={() => switchTo(community.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        padding: '0.55rem 0.7rem',
                        borderRadius: 8,
                        border: 'none',
                        background: isActive ? 'var(--color-primary-tint)' : 'transparent',
                        color: 'var(--color-ink)',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{community.name}</span>
                      {community.isAdmin && (
                        <span style={{ padding: '0.1rem 0.45rem', borderRadius: 999, background: 'var(--color-ink)', color: '#ffffff', fontSize: '0.66rem', fontWeight: 700, flexShrink: 0 }}>{t('dashboard.admin')}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export default CommunityBadge;
