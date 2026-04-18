import { ReactNode } from 'react';
import TopNav, { TopNavProps } from './TopNav';

/**
 * 로그인 후 공통 레이아웃. TopNav(상단바)와 콘텐츠 래퍼를 담당합니다.
 * 상단/하단 네비바 디자인은 TopNav, BottomNav 파일에서 관리됩니다.
 */
export type AppShellProps = TopNavProps & { children: ReactNode };

const AppShell = ({ children, ...navProps }: AppShellProps) => {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'transparent',
      padding: '0.75rem 0.75rem 5.5rem',
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-ink)',
    }}>
      <div style={{ width: '100%', maxWidth: 1040, margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <TopNav {...navProps} />
        {children}
      </div>
    </main>
  );
};

export default AppShell;
