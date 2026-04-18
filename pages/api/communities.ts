import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommunities, setCommunities } from '../../lib/dataStore';

type Community = {
  id: string;
  name: string;
  adminProfileId?: string;
  joinApprovalMode?: 'auto' | 'admin';
  requireRealName?: boolean;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const communities = (await getCommunities()) as Community[];

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json({ communities });
    }

    if (req.method === 'POST') {
      const { communityId, joinApprovalMode, requireRealName, timezone } = req.body as { communityId: string; joinApprovalMode?: 'auto' | 'admin'; requireRealName?: boolean; timezone?: string };
      if (!communityId) {
        return res.status(400).json({ error: 'communityId is required.' });
      }

      const index = communities.findIndex((item) => item.id === communityId);
      if (index === -1) {
        return res.status(404).json({ error: 'Community not found.' });
      }

      if (joinApprovalMode) communities[index].joinApprovalMode = joinApprovalMode;
      if (typeof requireRealName === 'boolean') communities[index].requireRealName = requireRealName;
      if (typeof timezone === 'string' && timezone.length > 0) (communities[index] as any).timezone = timezone;
      await setCommunities(communities);
      return res.status(200).json({ community: communities[index] });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load or update communities.' });
  }
};

export default handler;
