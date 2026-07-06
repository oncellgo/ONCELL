// 초대 링크 → 로그인 → 원래 초대로 복귀.
// 모바일 OAuth 왕복에서 sessionStorage 가 유실될 수 있어 localStorage(+시간 가드) 사용.
const KEY = 'oncellReturnTo';
const AT = 'oncellReturnToAt';
const MAX_AGE = 15 * 60 * 1000; // 15분 지난 복귀 경로는 무시(방치된 값 방지)

export function popReturnTo(fallback = '/dashboard'): string {
  try {
    const rt = window.localStorage.getItem(KEY);
    const at = parseInt(window.localStorage.getItem(AT) || '0', 10);
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(AT);
    // 같은 사이트 내부 경로만 허용 (오픈 리다이렉트 방지)
    if (rt && rt.startsWith('/') && !rt.startsWith('//') && Date.now() - at < MAX_AGE) return rt;
  } catch {}
  return fallback;
}
