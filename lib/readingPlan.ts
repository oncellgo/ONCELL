/**
 * 1년 1독 성경통독 계획 — 1월 1일부터 12월 31일까지 약 3장/일 균등 분배.
 * 총 1189장 / 365(또는 366)일.
 */

const BOOKS: Array<[string, number]> = [
  ['창세기', 50], ['출애굽기', 40], ['레위기', 27], ['민수기', 36], ['신명기', 34],
  ['여호수아', 24], ['사사기', 21], ['룻기', 4], ['사무엘상', 31], ['사무엘하', 24],
  ['열왕기상', 22], ['열왕기하', 25], ['역대상', 29], ['역대하', 36], ['에스라', 10],
  ['느헤미야', 13], ['에스더', 10], ['욥기', 42], ['시편', 150], ['잠언', 31],
  ['전도서', 12], ['아가', 8], ['이사야', 66], ['예레미야', 52], ['예레미야애가', 5],
  ['에스겔', 48], ['다니엘', 12], ['호세아', 14], ['요엘', 3], ['아모스', 9],
  ['오바댜', 1], ['요나', 4], ['미가', 7], ['나훔', 3], ['하박국', 3],
  ['스바냐', 3], ['학개', 2], ['스가랴', 14], ['말라기', 4],
  ['마태복음', 28], ['마가복음', 16], ['누가복음', 24], ['요한복음', 21], ['사도행전', 28],
  ['로마서', 16], ['고린도전서', 16], ['고린도후서', 13], ['갈라디아서', 6], ['에베소서', 6],
  ['빌립보서', 4], ['골로새서', 4], ['데살로니가전서', 5], ['데살로니가후서', 3],
  ['디모데전서', 6], ['디모데후서', 4], ['디도서', 3], ['빌레몬서', 1],
  ['히브리서', 13], ['야고보서', 5], ['베드로전서', 5], ['베드로후서', 3],
  ['요한일서', 5], ['요한이서', 1], ['요한삼서', 1], ['유다서', 1], ['요한계시록', 22],
];

// 평면 장 리스트 [{book, chapter}] — 총 1189 원소
const FLAT: Array<{ book: string; chapter: number }> = (() => {
  const out: Array<{ book: string; chapter: number }> = [];
  for (const [book, count] of BOOKS) {
    for (let c = 1; c <= count; c++) out.push({ book, chapter: c });
  }
  return out;
})();

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInYear = (y: number) => (isLeap(y) ? 366 : 365);

const pad = (n: number) => String(n).padStart(2, '0');
const keyFor = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const dayOfYear = (d: Date): number => {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * 특정 날짜의 통독 범위 반환 (연속된 장을 묶어 표시).
 * 예: [{ book:'창세기', startCh:1, endCh:3 }] → "창세기 1-3장"
 */
export type ReadingRange = { book: string; startCh: number; endCh: number };

export const planForDate = (date: Date): ReadingRange[] => {
  const year = date.getFullYear();
  const total = FLAT.length;
  const nDays = daysInYear(year);
  const i = dayOfYear(date);
  if (i < 0 || i >= nDays) return [];
  const startIdx = Math.floor((i * total) / nDays);
  const endIdx = Math.floor(((i + 1) * total) / nDays);
  const slice = FLAT.slice(startIdx, endIdx);
  if (slice.length === 0) return [];
  // 같은 book 연속은 묶음
  const out: ReadingRange[] = [];
  for (const item of slice) {
    const last = out[out.length - 1];
    if (last && last.book === item.book && last.endCh + 1 === item.chapter) {
      last.endCh = item.chapter;
    } else {
      out.push({ book: item.book, startCh: item.chapter, endCh: item.chapter });
    }
  }
  return out;
};

export const formatRange = (r: ReadingRange): string =>
  r.startCh === r.endCh ? `${r.book} ${r.startCh}장` : `${r.book} ${r.startCh}-${r.endCh}장`;

export const formatPlan = (ranges: ReadingRange[]): string =>
  ranges.map(formatRange).join(' · ');

export { keyFor as dateKey };
