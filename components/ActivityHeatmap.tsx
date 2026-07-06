import { ReactNode, useMemo, useState } from 'react';

/**
 * 연간 활동 히트맵 (월 × 주). 큐티·통독 공용.
 * 각 셀 = 그 주에 활동한 '일수'(0~7)로 초록 진하기. 월별 누적 → 성장 단계 아이콘.
 * 셀 클릭 시 renderDetail(월, 주, 그 주 항목들)을 하단 패널에 렌더.
 */

export type HeatItem = { date: string } & Record<string, unknown>; // date: YYYY-MM-DD

// 활동 일수(0~7)에 따른 초록 스케일
const GREEN = ['#eef1f4', '#e9f6d0', '#d5ed9f', '#b8e173', '#96d34e', '#71bd35', '#519f24', '#377d16'];

// 월 누적 일수 → 성장 단계 (씨앗 → 나무)
const growthIcon = (count: number): string => {
  if (count <= 0) return '·';
  if (count <= 3) return '🌱';
  if (count <= 7) return '🌿';
  if (count <= 14) return '🌳';
  return '🌲';
};

const weekOfMonth = (day: number): number => Math.min(5, Math.ceil(day / 7)); // 1주=1~7일 … 5주=29~31일
const mIdx = (s: string) => parseInt(s.slice(5, 7), 10) - 1;
const dNum = (s: string) => parseInt(s.slice(8, 10), 10);

const COL = '3.2rem 1fr 1fr 1fr 1fr 1fr 3.4rem';

type Props = {
  now: Date;
  items: HeatItem[]; // 올해 항목 (이미 연도 필터됨)
  loading?: boolean;
  renderDetail: (monthIdx: number, week: number, weekItems: HeatItem[]) => ReactNode;
};

const ActivityHeatmap = ({ now, items, loading, renderDetail }: Props) => {
  const [sel, setSel] = useState<{ month: number; week: number } | null>(null);
  const curMonth = now.getMonth();
  const curWeek = weekOfMonth(now.getDate());
  const monthsToShow = curMonth + 1;

  // grid[month][week] = 그 주 활동 일수(중복 제거)
  const grid = useMemo(() => {
    const g: Record<number, Record<number, Set<number>>> = {};
    for (const n of items) {
      if (!n.date) continue;
      const m = mIdx(n.date);
      const w = weekOfMonth(dNum(n.date));
      (g[m] ??= {});
      (g[m][w] ??= new Set());
      g[m][w].add(dNum(n.date));
    }
    return g;
  }, [items]);

  const monthDays = (m: number) => {
    const s = new Set<number>();
    for (const n of items) if (n.date && mIdx(n.date) === m) s.add(dNum(n.date));
    return s.size;
  };

  const selItems = useMemo(() => {
    if (!sel) return [] as HeatItem[];
    return items
      .filter((n) => n.date && mIdx(n.date) === sel.month && weekOfMonth(dNum(n.date)) === sel.week)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [sel, items]);

  return (
    <>
      <div style={{ padding: '0.9rem 0.8rem', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', overflowX: 'auto' }}>
        <div style={{ minWidth: 420, display: 'grid', gap: '0.3rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0.35rem', alignItems: 'center' }}>
            <span />
            {[1, 2, 3, 4, 5].map((w) => (
              <span key={w} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-ink-2)' }}>{w}주</span>
            ))}
            <span />
          </div>

          {loading && <div style={{ padding: '1rem', color: 'var(--color-ink-2)', fontSize: '0.85rem' }}>불러오는 중…</div>}

          {!loading && Array.from({ length: monthsToShow }, (_, m) => {
            const md = monthDays(m);
            return (
              <div key={m} style={{ display: 'grid', gridTemplateColumns: COL, gap: '0.35rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-ink)' }}>{String(m + 1).padStart(2, '0')}월</span>
                {[1, 2, 3, 4, 5].map((w) => {
                  const days = grid[m]?.[w]?.size || 0;
                  const isThisWeek = m === curMonth && w === curWeek;
                  const isSel = sel?.month === m && sel?.week === w;
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setSel(isSel ? null : { month: m, week: w })}
                      aria-label={`${m + 1}월 ${w}주, ${days}일`}
                      style={{
                        position: 'relative', height: 30, borderRadius: 7, background: GREEN[days],
                        border: isSel ? '2px solid var(--color-primary-deep)' : isThisWeek ? '2px solid var(--color-primary)' : '1px solid rgba(0,0,0,0.05)',
                        cursor: 'pointer', padding: 0,
                      }}
                    >
                      {isThisWeek && (
                        <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', fontSize: '0.56rem', fontWeight: 800, color: '#fff', background: 'var(--color-primary)', borderRadius: 999, padding: '0.05rem 0.35rem', whiteSpace: 'nowrap' }}>이번주</span>
                      )}
                    </button>
                  );
                })}
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 800, color: md > 0 ? 'var(--color-primary-deep)' : 'var(--color-ink-2)' }}>
                  <span aria-hidden style={{ fontSize: '0.95rem' }}>{growthIcon(md)}</span>{md}
                </span>
              </div>
            );
          })}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3rem', paddingTop: '0.3rem' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)' }}>0일</span>
            {GREEN.map((c, i) => (
              <span key={i} style={{ width: 13, height: 13, borderRadius: 3, background: c, border: '1px solid rgba(0,0,0,0.06)' }} />
            ))}
            <span style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)' }}>7일</span>
          </div>
        </div>
      </div>

      {sel && (
        <section style={{ padding: '1rem 1.1rem', borderRadius: 14, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.7rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: 'var(--color-ink)', fontSize: '0.95rem' }}>{sel.month + 1}월 {sel.week}주 ({selItems.length})</strong>
            <button type="button" onClick={() => setSel(null)} style={{ background: 'transparent', border: 'none', color: 'var(--color-ink-2)', fontSize: '1rem', cursor: 'pointer', padding: '0.2rem 0.4rem' }}>✕</button>
          </div>
          {selItems.length === 0
            ? <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.85rem' }}>이 주에 기록이 없어요.</p>
            : renderDetail(sel.month, sel.week, selItems)}
        </section>
      )}
    </>
  );
};

export default ActivityHeatmap;
