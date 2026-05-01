import type { NextApiRequest, NextApiResponse } from 'next';
import { getCellById, isCellMember, getCellMembers } from '../../../lib/cells';
import { getProfiles } from '../../../lib/dataStore';

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

    const members = await getCellMembers(cellId);
    const profileIds = members.map((m) => m.profile_id);
    const allProfiles = await getProfiles().catch(() => [] as any[]);
    const profileMap = new Map<string, { realName?: string; nickname?: string }>();
    for (const p of allProfiles as Array<any>) {
      profileMap.set(p.profileId, { realName: p.realName, nickname: p.nickname });
    }
    const enriched = members.map((m) => {
      const p = profileMap.get(m.profile_id) || {};
      const display = p.realName || p.nickname || m.profile_id.split('-').pop() || m.profile_id;
      return {
        profileId: m.profile_id,
        displayName: display,
        joinedAt: m.joined_at,
        isOwner: cell.owner_profile_id === m.profile_id,
      };
    });

    return res.status(200).json({ cell, members: enriched });
  } catch (e: any) {
    console.error('[api/cells/:id] failed', e);
    return res.status(500).json({ error: 'fetch failed', errorReason: e?.message || String(e) });
  }
}
