import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getCommunities, getUsers } from '../../../lib/dataStore';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const [communities, users] = await Promise.all([
      getCommunities() as Promise<Array<{ id: string; name: string; adminProfileId?: string; joinApprovalMode?: 'auto' | 'admin' }>>,
      getUsers() as Promise<Array<{ communityId: string; membershipStatus?: 'active' | 'pending' }>>,
    ]);

    const enriched = communities.map((c) => {
      const members = users.filter((u: any) => u.communityId === c.id);
      const createdAt = (() => {
        const m = /^community-(\d+)/.exec(c.id);
        return m ? new Date(Number(m[1])).toISOString() : null;
      })();
      const latestActivityAt = members
        .map((m: any) => m.registeredAt as string | undefined)
        .filter((v: string | undefined): v is string => Boolean(v))
        .sort()
        .pop() || null;
      return {
        ...c,
        memberCount: members.length,
        pendingCount: members.filter((m: any) => m.membershipStatus === 'pending').length,
        createdAt,
        latestActivityAt,
      };
    });

    return res.status(200).json({ communities: enriched });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load communities.' });
  }
};

export default handler;
