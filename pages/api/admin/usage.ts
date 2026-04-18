import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommunityUsage, getCommunityCreditState } from '../../../lib/credits';
import { getCommunities } from '../../../lib/dataStore';

type Community = {
  id: string;
  adminProfileId?: string;
};

const isCommunityAdmin = async (profileId: string, communityId: string): Promise<boolean> => {
  try {
    const list = (await getCommunities()) as Community[];
    const c = list.find((x) => x.id === communityId);
    return !!c && c.adminProfileId === profileId;
  } catch {
    return false;
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : '';
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
  if (!communityId || !profileId) return res.status(400).json({ error: 'communityId and profileId are required.' });

  const admin = await isCommunityAdmin(profileId, communityId);
  if (!admin) return res.status(403).json({ error: 'Community admin only.' });

  try {
    const state = await getCommunityCreditState(communityId);
    const logs = await getCommunityUsage(communityId);

    // Aggregate by action (current month)
    const now = new Date();
    const thisMonth = logs.filter((l) => {
      const d = new Date(l.at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const byAction: Record<string, { count: number; totalCost: number }> = {};
    for (const l of thisMonth) {
      if (!byAction[l.action]) byAction[l.action] = { count: 0, totalCost: 0 };
      byAction[l.action].count += 1;
      byAction[l.action].totalCost += l.cost || 0;
    }

    return res.status(200).json({
      state,
      summary: { thisMonth: byAction, totalLogs: logs.length },
      recent: logs.slice(0, 50),
    });
  } catch (e: any) {
    console.error('usage handler error', e);
    return res.status(500).json({ error: e?.message || 'server-error' });
  }
};

export default handler;
