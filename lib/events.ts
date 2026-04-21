/**
 * 이벤트 공용 유틸
 */

/**
 * "종일(all-day)" 이벤트 판정.
 * startAt이 해당 일 00:00:00 이고 endAt이 같은(또는 이후) 날짜 23:59 이상이면 종일로 간주.
 * 모든 월별 일괄 삽입(plan2026-*)과 새 일정 등록에서 "종일" 체크 시 이 패턴으로 저장됨.
 */
export const isAllDayEvent = (startAt?: string | null, endAt?: string | null): boolean => {
  if (!startAt || !endAt) return false;
  const s = new Date(startAt);
  const e = new Date(endAt);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
  const sAtMidnight = s.getHours() === 0 && s.getMinutes() === 0 && s.getSeconds() === 0;
  // 끝 시각이 23:59 이상 (23:59, 23:59:59 등 모두 허용)
  const eNearDayEnd = e.getHours() === 23 && e.getMinutes() >= 59;
  return sAtMidnight && eNearDayEnd;
};
