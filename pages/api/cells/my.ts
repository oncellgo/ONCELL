import type { NextApiRequest, NextApiResponse } from 'next';
import { getCellsByMember } from '../../../lib/cells';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
  if (!profileId) return res.status(401).json({ error: 'profileId required' });

  try {
    const cells = await getCellsByMember(profileId);
    return res.status(200).json({ cells });
  } catch (e: any) {
    console.error('[api/cells/my] failed', e);
    return res.status(500).json({ error: 'fetch failed', errorReason: e?.message || String(e) });
  }
}
