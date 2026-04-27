import type { ReactNode } from 'react';

/**
 * provider(kakao/google/그 외) + 표시할 id 를 받아 카카오 노란 / 구글 흰바탕+로고 / 폴백 회색 pill 로 렌더링.
 * MembersCard, SignupApprovalsCard, RejectedCard, admin/system 에서 공유.
 */
export const providerIdPill = (provider: string | undefined, id: string): ReactNode => {
  const p = provider || '';
  const bg = p === 'kakao' ? '#FEE500' : p === 'google' ? '#fff' : '#E5E7EB';
  const color = p === 'kakao' ? '#181600' : p === 'google' ? '#1F2937' : '#374151';
  const border = p === 'google' ? '1px solid #D1D5DB' : '1px solid transparent';

  let icon: ReactNode;
  if (p === 'google') {
    icon = (
      <svg viewBox="0 0 48 48" width={14} height={14} aria-hidden="true" style={{ flex: '0 0 auto', display: 'block' }}>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.8-2 13.3-5.2l-6.2-5.2c-2 1.4-4.5 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C41.3 35 44 29.9 44 24c0-1.2-.1-2.3-.4-3.5z" />
      </svg>
    );
  } else {
    const prefix = p === 'kakao' ? 'K' : p ? p.charAt(0).toUpperCase() : '?';
    const dotBg = p === 'kakao' ? '#181600' : '#6B7280';
    const dotFg = p === 'kakao' ? '#FEE500' : '#1F2937';
    icon = (
      <span style={{ width: 14, height: 14, borderRadius: 999, background: dotBg, color: dotFg, fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{prefix}</span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.55rem', borderRadius: 999, background: bg, color, fontSize: '0.76rem', fontWeight: 700, border, whiteSpace: 'nowrap', maxWidth: '100%' }}>
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{id}</span>
    </span>
  );
};
