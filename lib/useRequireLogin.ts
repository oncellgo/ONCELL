import { useEffect } from 'react';

/**
 * 보호 페이지 공용 로그인 가드 — 서버 세션(/api/auth/me)이 진실원본.
 *
 * Phase 2(세션 쿠키) 이후: localStorage 만 있고 쿠키 없는 stale 세션은
 * API 가 전부 401 이므로, 여기서 서버에 확인해 미인증이면 로그인으로 보낸다(재로그인 브리지).
 * 네트워크 오류 시엔 판단을 보류(강제 로그아웃 오탐 방지).
 */
export const useRequireLogin = (_propsProfileId?: string | null) => {
  useEffect(() => {
    let alive = true;
    (async () => {
      let authed = false;
      try {
        const r = await fetch('/api/auth/me');
        authed = r.ok;
      } catch {
        return; // 네트워크 오류: 판단 보류
      }
      if (!alive || authed) return;
      // 미인증(쿠키 없음/만료) → stale localStorage 정리 후 로그인으로
      try {
        window.localStorage.removeItem('kcisProfileId');
        window.localStorage.removeItem('kcisNickname');
        window.localStorage.removeItem('kcisEmail');
        window.localStorage.removeItem('kcisSystemAdminHref');
      } catch {}
      window.location.href = '/auth/login';
    })();
    return () => { alive = false; };
  }, []);
};
