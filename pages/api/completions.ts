import type { NextApiRequest, NextApiResponse } from 'next';
import { db, T } from '../../lib/db';

/**
 * 사용자 완료 기록 (큐티·통독 공용)
 *
 * GET    /api/completions?profileId=X&type=qt|reading[&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *        → { dates: string[] }
 * POST   { profileId, type, date } → upsert (오늘만 허용 — UTC+8 기준)
 * DELETE ?profileId=X&type=qt|reading&date=YYYY-MM-DD
 *
 * 타임존: 싱가폴(UTC+8). 과거 소급 완료는 불가 (type=reading에 한함).
 * type=qt는 묵상노트 저장 핸들러에서 서버 내부로 호출될 수 있음 (과거 허용).
 */

const TABLE = 'kcis_user_completions';
const VALID_TYPES = new Set(['qt', 'reading']);

// UTC+8 기준 오늘 YYYY-MM-DD
const todaySG = (): string => {
  const now = new Date();
  const sg = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sg.getFullYear()}-${pad(sg.getMonth() + 1)}-${pad(sg.getDate())}`;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method === 'GET') {
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
      const type = typeof req.query.type === 'string' ? req.query.type : '';
      if (!profileId || !VALID_TYPES.has(type)) return res.status(400).json({ error: 'profileId, type 필수' });
      let q = db.from(TABLE).select('date').eq('profile_id', profileId).eq('type', type);
      if (typeof req.query.from === 'string') q = q.gte('date', req.query.from);
      if (typeof req.query.to === 'string') q = q.lte('date', req.query.to);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ dates: (data || []).map((r: any) => r.date) });
    }

    if (req.method === 'POST') {
      const { profileId, type, date, allowPast } = req.body as { profileId?: string; type?: string; date?: string; allowPast?: boolean };
      if (!profileId || !type || !date) return res.status(400).json({ error: 'profileId, type, date 필수' });
      if (!VALID_TYPES.has(type)) return res.status(400).json({ error: 'type invalid' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date YYYY-MM-DD' });
      // 과거 소급 금지 — type=reading은 오늘만. type=qt는 노트 저장 시 내부 호출이므로 허용.
      if (type === 'reading' && !allowPast) {
        if (date !== todaySG()) return res.status(400).json({ error: '오늘 날짜만 완료 처리 가능합니다.' });
      }
      const { error } = await db.from(TABLE).upsert({ profile_id: profileId, type, date, completed_at: new Date().toISOString() }, { onConflict: 'profile_id,type,date' });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
      const type = typeof req.query.type === 'string' ? req.query.type : '';
      const date = typeof req.query.date === 'string' ? req.query.date : '';
      if (!profileId || !VALID_TYPES.has(type) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'profileId, type, date 필수' });
      const { error } = await db.from(TABLE).delete().eq('profile_id', profileId).eq('type', type).eq('date', date);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[completions]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
};

export default handler;
