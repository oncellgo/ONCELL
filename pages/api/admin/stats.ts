import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { db } from '../../../lib/db';

/**
 * 관리자 통계: kcis_user_completions 기준 월별 일자별 완료자 수 집계.
 * GET /api/admin/stats?year=YYYY&month=M   (1-12)
 *   → { days: { [YYYY-MM-DD]: { qt: number; reading: number } } }
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'year, month 필수 (month 1-12)' });
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const from = `${year}-${pad(month)}-01`;
  const to = `${year}-${pad(month)}-${pad(lastDay)}`;

  try {
    const { data, error } = await db
      .from('kcis_user_completions')
      .select('date, type, profile_id')
      .gte('date', from)
      .lte('date', to);
    if (error) return res.status(500).json({ error: error.message });

    const days: Record<string, { qt: number; reading: number }> = {};
    for (let d = 1; d <= lastDay; d++) {
      days[`${year}-${pad(month)}-${pad(d)}`] = { qt: 0, reading: 0 };
    }
    for (const row of (data || []) as Array<{ date: string; type: string; profile_id: string }>) {
      const bucket = days[row.date];
      if (!bucket) continue;
      if (row.type === 'qt') bucket.qt += 1;
      else if (row.type === 'reading') bucket.reading += 1;
    }
    return res.status(200).json({ year, month, days });
  } catch (e: any) {
    console.error('[admin/stats]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
};

export default handler;
