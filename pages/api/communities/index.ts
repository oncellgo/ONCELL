import type { NextApiRequest, NextApiResponse } from 'next';
import { listCommunities, getCommunityMemberCount } from '../../../lib/community';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  try {
    const list = await listCommunities();
    const enriched = await Promise.all(list.map(async (c) => ({
      ...c,
      member_count: await getCommunityMemberCount(c.id).catch(() => 0),
    })));
    return res.status(200).json({ communities: enriched });
  } catch (e: any) {
    console.error('[api/communities] failed', e);
    return res.status(500).json({ error: 'fetch failed', errorReason: e?.message || String(e) });
  }
}
