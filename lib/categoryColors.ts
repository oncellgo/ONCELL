export type CategoryColor = { bg: string; fg: string; border: string };

// 일정 구분별 색상 체계 (달력·뱃지 공통)
// 예배: 연빨강 / 기도회: 연오렌지 / 양육·수련회: 연초록 / 기념일: 회색 / 행사: 연노랑
const PALETTE = {
  worship: { bg: '#FEE2E2', fg: '#991B1B', border: '#FCA5A5' },
  prayer: { bg: '#FFEDD5', fg: '#9A3412', border: '#FDBA74' },
  nurture: { bg: '#DCFCE7', fg: '#166534', border: '#86EFAC' },
  memorial: { bg: '#F3F4F6', fg: '#4B5563', border: '#D1D5DB' },
  event: { bg: '#FEF9C3', fg: '#854D0E', border: '#FDE047' },
  default: { bg: '#ECFCCB', fg: '#3F6212', border: '#D9F09E' },
} as const;

const CATEGORY_MAP: Record<string, CategoryColor> = {
  '일반예배': PALETTE.worship,
  '특별예배': PALETTE.worship,
  '예배': PALETTE.worship,
  '기도회': PALETTE.prayer,
  '특별기도회': PALETTE.prayer,
  '양육': PALETTE.nurture,
  '수련회': PALETTE.nurture,
  '교육': PALETTE.nurture,
  '기념일': PALETTE.memorial,
  '행사': PALETTE.event,
};

export const categoryColorFor = (cat?: string): CategoryColor => {
  if (!cat) return PALETTE.default;
  return CATEGORY_MAP[cat] || PALETTE.default;
};

export const CATEGORY_COLOR_LEGEND: Array<{ label: string; color: CategoryColor; matches: string[] }> = [
  { label: '예배', color: PALETTE.worship, matches: ['일반예배', '특별예배'] },
  { label: '기도회', color: PALETTE.prayer, matches: ['기도회', '특별기도회'] },
  { label: '양육', color: PALETTE.nurture, matches: ['양육', '수련회', '교육'] },
  { label: '기념일', color: PALETTE.memorial, matches: ['기념일'] },
  { label: '행사', color: PALETTE.event, matches: ['행사'] },
  { label: '기타', color: PALETTE.default, matches: [] },
];

// 표준 표시 순서: 예배 → 기도회 → 양육 → 기념일 → 행사 → (기타/사용자추가)
// 같은 그룹 내에서는 legend.matches 순서를 따른다 (예: 일반예배 → 특별예배).
const CANONICAL_ORDER: string[] = (() => {
  const out: string[] = [];
  for (const leg of CATEGORY_COLOR_LEGEND) {
    for (const m of leg.matches) if (!out.includes(m)) out.push(m);
  }
  return out;
})();

export const sortCategories = (list: string[]): string[] => {
  const ranked = list.map((name, idx) => {
    const knownIdx = CANONICAL_ORDER.indexOf(name);
    return { name, rank: knownIdx >= 0 ? knownIdx : CANONICAL_ORDER.length + idx };
  });
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((x) => x.name);
};
