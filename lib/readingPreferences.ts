/**
 * 성경통독 계획 선호도 — 클라이언트 측 영속화.
 *
 * 값: 1 (1년 1독, 하루 ≈ 3장) | 2 (1년 2독, 하루 ≈ 6-7장)
 * 저장소: localStorage `kcis_reading_plan`
 *
 * 미래 확장: DB (kcis_profiles.reading_plan) 동기화 시 본 파일에서 fetch/PUT 추가.
 * 현재는 클라이언트-only. SSR 안전(ReturnType 에 undefined 허용).
 */

export type ReadingPlan = 1 | 2;

const STORAGE_KEY = 'kcis_reading_plan';
const CHANGE_EVENT = 'kcis:reading-plan-changed';

/** 저장된 플랜 반환. 미지정 시 null — 호출부에서 기본값(1) 적용 여부 결정. */
export const getReadingPlan = (): ReadingPlan | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === '1') return 1;
    if (raw === '2') return 2;
    return null;
  } catch {
    return null;
  }
};

export const setReadingPlan = (plan: ReadingPlan): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(plan));
    // 같은 탭의 다른 컴포넌트(예: /reading 페이지)가 즉시 반응하도록 custom event 발행.
    // (storage event 는 다른 탭에서만 발화하므로 같은 탭 내에서는 수신 불가)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: plan }));
  } catch {}
};

/** 플랜 변경 구독. 반환값은 언구독 함수. */
export const subscribeReadingPlan = (handler: (plan: ReadingPlan) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail === 1 || detail === 2) handler(detail);
  };
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
};

/** 사용자가 명시적으로 선택했는지 여부 (최초 진입 배너 노출 판단). */
export const hasReadingPlan = (): boolean => getReadingPlan() !== null;

/** 플랜 라벨 — UI 공용. */
export const planLabel = (plan: ReadingPlan): string =>
  plan === 2 ? '1년 2독 (하루 6–7장)' : '1년 1독 (하루 ≈ 3장)';

export const planShortLabel = (plan: ReadingPlan): string =>
  plan === 2 ? '2독' : '1독';
