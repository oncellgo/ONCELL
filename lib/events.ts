/**
 * 이벤트 공용 유틸
 *
 * 모든 이벤트 시간 계산은 **싱가폴 시간(UTC+8)** 고정.
 * 브라우저 로컬 TZ가 KST(UTC+9) 등 다른 값이어도 동일 결과.
 */

const SG_OFFSET_MS = 8 * 60 * 60 * 1000;

// UTC ISO 문자열을 SG 로컬 "벽시계" 시각을 가진 Date로 변환
// (UTC getter로 읽으면 SG 로컬 값이 나오는 트릭)
const toSGWall = (iso: string): Date => new Date(new Date(iso).getTime() + SG_OFFSET_MS);

/**
 * ISO 시각의 SG 로컬 YYYY-MM-DD 반환.
 */
export const getSGDateKey = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = toSGWall(iso);
  if (isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * "종일(all-day)" 이벤트 판정 (SG 시간 기준).
 * start_at = SG 00:00, end_at = SG 23:59 이상 패턴.
 */
export const isAllDayEvent = (startAt?: string | null, endAt?: string | null): boolean => {
  if (!startAt || !endAt) return false;
  const s = toSGWall(startAt);
  const e = toSGWall(endAt);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return false;
  const sAtMidnight = s.getUTCHours() === 0 && s.getUTCMinutes() === 0 && s.getUTCSeconds() === 0;
  const eNearDayEnd = e.getUTCHours() === 23 && e.getUTCMinutes() >= 59;
  return sAtMidnight && eNearDayEnd;
};
