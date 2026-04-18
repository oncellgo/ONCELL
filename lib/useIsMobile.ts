import { useEffect, useState } from 'react';

/**
 * 모바일 화면 여부를 감지하는 훅.
 * SSR 안전: 첫 렌더는 항상 false → 클라이언트 마운트 후 정확한 값으로 갱신.
 *
 * @param breakpoint 픽셀 단위, 기본 640 (Tailwind 'sm' 경계)
 * @example
 *   const isMobile = useIsMobile();
 *   <div style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr' }} />
 */
export const useIsMobile = (breakpoint = 640): boolean => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, [breakpoint]);

  return isMobile;
};

/**
 * 태블릿 이하 (≤1024px) 감지.
 */
export const useIsTablet = (): boolean => useIsMobile(1024);
