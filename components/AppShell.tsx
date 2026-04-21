import { ReactNode } from 'react';
import TopNav, { TopNavProps } from './TopNav';
import MenuBar from './MenuBar';

/**
 * 로그인 후 공통 레이아웃. TopNav(상단바) + MenuBar(공통 6메뉴) + 콘텐츠 래퍼.
 * 관리자 페이지 등 공통 메뉴바가 불필요한 곳은 `showMenuBar={false}` 로 숨긴다.
 */
export type AppShellProps = TopNavProps & { children: ReactNode; showMenuBar?: boolean };

const AppShell = ({ children, showMenuBar = true, ...navProps }: AppShellProps) => {
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
        {showMenuBar && (
          <div style={{ marginTop: '-0.75rem' }}>
            <MenuBar profileId={navProps.profileId} nickname={navProps.nickname} email={navProps.email} />
          </div>
        )}
        {children}
      </div>
    </main>
  );
};

export default AppShell;
