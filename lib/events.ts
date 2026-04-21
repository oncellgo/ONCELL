/**
 * 이벤트 공용 유틸
 *
 * 모든 이벤트 시간 계산은 **싱가폴 시간(UTC+8)** 고정.
 * 브라우저 로컬 TZ가 KST(UTC+9) 등 다른 값이어도 동일 결과.
 */

const SG_OFFSET_MS = 8 * 60 * 60 * 1000;

// UTC ISO 문자열(또는 Date)을 SG 로컬 "벽시계" 시각을 가진 Date로 변환
// (UTC getter로 읽으면 SG 로컬 값이 나오는 트릭)
const toSGWall = (input: string | Date): Date => {
  const ms = typeof input === 'string' ? new Date(input).getTime() : input.getTime();
  return new Date(ms + SG_OFFSET_MS);
};

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
 * 현재(SG) YYYY-MM-DD.
 * Vercel 서버가 UTC라서 KST 새벽(= UTC 전날 밤)에는 getDate()가 전날을 반환하는 버그 방지.
 */
export const getSGTodayKey = (): string => {
  const d = toSGWall(new Date());
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * ISO 시각(또는 현재)의 SG 기준 요일 (0=일 ~ 6=토).
 */
export const getSGDow = (iso?: string | Date | null): number => {
  const src: string | Date = iso ?? new Date();
  const d = toSGWall(src);
  return d.getUTCDay();
};

/**
 * SG 기준 이번주 일요일의 YYYY-MM-DD.
 * (기준일이 일요일이면 자기 자신)
 */
export const getSGSundayKey = (iso?: string | Date | null): string => {
  const src: string | Date = iso ?? new Date();
  const d = toSGWall(src);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * YYYY-MM-DD 키에 n일을 더한 키 반환 (SG 기준, wall-clock 계산이라 TZ 무관).
 */
export const addDaysToKey = (key: string, days: number): string => {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
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
