import { ReactNode } from 'react';
import TopNav from './TopNav';
import MenuBar from './MenuBar';

/**
 * 하위(서브) 페이지 공통 헤더 = 메인 페이지와 동일한 TopNav + 아래 MenuBar.
 *
 * 이전엔 SubHeader 가 자체 헤더 JSX 를 가졌지만, 디자인 일관성을 위해
 * 전부 TopNav 를 재사용하도록 통합. 페이지는 이 컴포넌트를 그대로 import 하므로
 * 호출부 변경 없음.
 *
 * - TopNav: 로고 · 대시보드 · (관리자) · 닉네임+톱니 · 언어
 * - MenuBar: 장소예약 · 큐티 · 성경통독 · 주보 · 구역모임교안
 */
export type SubHeaderProps = {
  /** @deprecated — TopNav 가 관리자 버튼을 자체 처리함. 남아있는 호출부 호환용. */
  rightExtras?: ReactNode;
  profileId?: string | null;
  displayName?: string | null;
  nickname?: string | null;
  email?: string | null;
  systemAdminHref?: string | null;
};

const SubHeader = ({ profileId, displayName, nickname, email, systemAdminHref }: SubHeaderProps) => {
  return (
    <>
      <TopNav
        profileId={profileId ?? null}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref ?? undefined}
      />
      <MenuBar profileId={profileId ?? null} nickname={nickname ?? null} email={email ?? null} />
    </>
  );
};

export default SubHeader;
