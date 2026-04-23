import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '../../lib/db';

/**
 * 성경통독 계획 조회 — kcis_reading_plans 에서 날짜별 범위 반환.
 *
 * 단일 날짜:    GET /api/reading-plan?plan=1&date=2026-04-23
 *                 → { plan, date, ranges: [{book,startCh,endCh}, ...] }
 * 주간 범위:    GET /api/reading-plan?plan=1&from=2026-04-19&to=2026-04-25
 *                 → { plan, days: [{date, ranges}, ...] }
 *
 * 캐시: public s-maxage 1일 — 계획표는 변경 드묾. 연말 재시드 시 CDN 자연 만료.
 */

type PlanRow = { date: string; ranges: unknown };

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const planRaw = typeof req.query.plan === 'string' ? req.query.plan : '1';
  const plan = parseInt(planRaw, 10);
  if (!Number.isInteger(plan) || plan < 1 || plan > 10) {
    return res.status(400).json({ error: 'plan must be 1..10' });
  }

  const date = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : '';
  const to   = typeof req.query.to   === 'string' ? req.query.to.trim()   : '';

  // 단일 날짜
  if (date) {
    if (!DATE_RX.test(date)) return res.status(400).json({ error: 'date 형식 YYYY-MM-DD' });
    const { data, error } = await db
      .from('kcis_reading_plans')
      .select('date, ranges')
      .eq('plan', plan)
      .eq('date', date)
      .maybeSingle();
    if (error) {
      console.error('[reading-plan] supabase error', error);
      return res.status(500).json({ error: error.message });
    }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({
      plan,
      date,
      ranges: (data as PlanRow | null)?.ranges || [],
      found: !!data,
    });
  }

  // 범위 조회
  if (from || to) {
    if (!DATE_RX.test(from) || !DATE_RX.test(to)) return res.status(400).json({ error: 'from/to 형식 YYYY-MM-DD' });
    if (from > to) return res.status(400).json({ error: 'from > to' });
    // 안전장치: 최대 400일
    const ms = (a: string) => new Date(a).getTime();
    if ((ms(to) - ms(from)) / (24 * 3600 * 1000) > 400) {
      return res.status(400).json({ error: 'range too large (max 400 days)' });
    }
    const { data, error } = await db
      .from('kcis_reading_plans')
      .select('date, ranges')
      .eq('plan', plan)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });
    if (error) {
      console.error('[reading-plan] supabase error', error);
      return res.status(500).json({ error: error.message });
    }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400');
    return res.status(200).json({
      plan,
      days: (data as PlanRow[] | null) || [],
    });
  }

  return res.status(400).json({ error: 'date 또는 from/to 필요' });
};

export default handler;
