import type { NextApiRequest, NextApiResponse } from 'next';
import { getCellById, isCellMember, getCellMembers } from '../../../../lib/cells';
import { getProfiles, getSignupApprovals } from '../../../../lib/dataStore';
import { requireSession } from '../../../../lib/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const cellId = typeof req.query.id === 'string' ? req.query.id : '';
  const profileId = requireSession(req, res);
  if (!profileId) return;
  if (!cellId) return res.status(400).json({ error: 'cell id required' });

  try {
    const cell = await getCellById(cellId);
    if (!cell) return res.status(404).json({ error: 'cell not found' });

    const member = await isCellMember(cellId, profileId);
    if (!member) return res.status(403).json({ error: 'not a member' });

    const members = await getCellMembers(cellId);
    // 표시명 — 별칭(nickname) 우선. approval.nickname → profile.nickname → '셀 친구'.
    const [allProfiles, approvals] = await Promise.all([
      getProfiles().catch(() => [] as any[]),
      getSignupApprovals().catch(() => [] as any[]),
    ]);
    const nameMap = new Map<string, string>();
    for (const a of approvals as Array<any>) if (a.profileId && a.nickname) nameMap.set(a.profileId, a.nickname);
    for (const p of allProfiles as Array<any>) {
      if (!nameMap.get(p.profileId)) { const n = p.nickname || p.realName; if (n) nameMap.set(p.profileId, n); }
    }
    const enriched = members.map((m) => {
      const display = nameMap.get(m.profile_id) || '셀 친구';
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
