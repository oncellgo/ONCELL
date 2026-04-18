import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../../lib/adminGuard';
import { getCommunities, setCommunities, getUsers, setUsers } from '../../../../lib/dataStore';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return res.status(400).json({ error: 'Community id is required.' });

  if (req.method === 'DELETE') {
    try {
      const [communities, users] = await Promise.all([
        getCommunities() as Promise<Array<{ id: string }>>,
        getUsers() as Promise<Array<{ communityId: string }>>,
      ]);

      const nextCommunities = communities.filter((c) => c.id !== id);
      const nextUsers = users.filter((u) => u.communityId !== id);
      if (nextCommunities.length === communities.length) return res.status(404).json({ error: 'Community not found.' });

      await Promise.all([
        setCommunities(nextCommunities),
        setUsers(nextUsers),
      ]);
      return res.status(200).json({ ok: true, removedMembers: users.length - nextUsers.length });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to delete community.' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { adminProfileId } = req.body as { adminProfileId?: string };
      const communities = (await getCommunities()) as Array<{ id: string; adminProfileId?: string }>;
      const idx = communities.findIndex((c) => c.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Community not found.' });
      if (adminProfileId) communities[idx].adminProfileId = adminProfileId;
      await setCommunities(communities);
      return res.status(200).json({ community: communities[idx] });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'Failed to update community.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
