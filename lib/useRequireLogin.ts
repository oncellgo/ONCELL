import { useEffect } from 'react';

/**
 * 보호 페이지 공용 로그인 가드.
 * props.profileId(SSR 쿼리) 우선, 없으면 localStorage(kcisProfileId) 확인.
 * 둘 다 없으면 /auth/login 으로 이동.
 */
export const useRequireLogin = (propsProfileId: string | null | undefined) => {
  useEffect(() => {
    if (propsProfileId) return;
    try {
      const p = typeof window !== 'undefined' ? window.localStorage.getItem('kcisProfileId') : null;
      if (p) return;
    } catch {}
    if (typeof window !== 'undefined') window.location.href = '/auth/login';
  }, [propsProfileId]);
};
