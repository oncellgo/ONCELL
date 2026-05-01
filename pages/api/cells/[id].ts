import type { NextApiRequest, NextApiResponse } from 'next';
import { getCellById, isCellMember } from '../../../lib/cells';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const cellId = typeof req.query.id === 'string' ? req.query.id : '';
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
  if (!cellId) return res.status(400).json({ error: 'cell id required' });
  if (!profileId) return res.status(401).json({ error: 'profileId required' });

  try {
    const cell = await getCellById(cellId);
    if (!cell) return res.status(404).json({ error: 'cell not found' });

    const member = await isCellMember(cellId, profileId);
    if (!member) return res.status(403).json({ error: 'not a member' });

    return res.status(200).json({ cell });
  } catch (e: any) {
    console.error('[api/cells/:id] failed', e);
    return res.status(500).json({ error: 'fetch failed', errorReason: e?.message || String(e) });
  }
}
