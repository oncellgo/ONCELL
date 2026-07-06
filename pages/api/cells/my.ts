import type { NextApiRequest, NextApiResponse } from 'next';
import { getCellsByMember } from '../../../lib/cells';
import { requireSession } from '../../../lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const profileId = requireSession(req, res);
  if (!profileId) return;

  try {
    const cells = await getCellsByMember(profileId);
    return res.status(200).json({ cells });
  } catch (e: any) {
    console.error('[api/cells/my] failed', e);
    return res.status(500).json({ error: 'fetch failed', errorReason: e?.message || String(e) });
  }
}
