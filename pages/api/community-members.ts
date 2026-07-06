import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommunities, getUsers } from '../../lib/dataStore';
import { requireSession } from '../../lib/session';

type Community = { id: string; name: string; adminProfileId?: string };
type UserEntry = {
  userId: string;
  provider: string;
  providerProfileId: string;
  communityId: string;
  communityName: string;
  nickname: string;
  realName: string;
  contact: string;
  membershipStatus?: 'active' | 'pending';
  registeredAt: string;
  profile: any;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : null;
  const profileId = requireSession(req, res);
  if (!profileId) return;
  if (!communityId) return res.status(400).json({ error: 'communityId required.' });

  try {
    const [communities, users] = await Promise.all([
      getCommunities() as Promise<Community[]>,
      getUsers() as Promise<UserEntry[]>,
    ]);
    const community = communities.find((c) => c.id === communityId);
    if (!community) return res.status(404).json({ error: 'Community not found.' });
    if (community.adminProfileId !== profileId) return res.status(403).json({ error: '권한이 없습니다.' });

    if (req.method === 'GET') {
      const members = users.filter((u) => u.communityId === communityId);
      return res.status(200).json({ members });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed.' });
  }
};

export default handler;
