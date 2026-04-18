import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getUsers, getProfiles, getCommunities } from '../../../lib/dataStore';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const [users, profiles, communities] = await Promise.all([
      getUsers() as Promise<Array<any>>,
      getProfiles() as Promise<Array<any>>,
      getCommunities() as Promise<Array<{ id: string; adminProfileId?: string }>>,
    ]);
    const adminProfileIds = new Set(communities.map((c) => c.adminProfileId).filter(Boolean) as string[]);

    type Row = { profileId: string; nickname?: string; realName?: string; email?: string; provider?: string; communities: string[]; registeredAt: string | null; isCommunityAdmin: boolean };
    const byProfile = new Map<string, Row>();
    profiles.forEach((p) => {
      byProfile.set(p.profileId, { profileId: p.profileId, nickname: p.nickname, realName: p.realName, email: p.email, provider: p.provider, communities: [], registeredAt: null, isCommunityAdmin: adminProfileIds.has(p.profileId) });
    });
    users.forEach((u) => {
      const key = u.providerProfileId;
      if (!key) return;
      const existing = byProfile.get(key) || { profileId: key, nickname: u.nickname, realName: u.realName, email: u.profile?.kakao_account?.email, provider: u.provider, communities: [] as string[], registeredAt: null as string | null, isCommunityAdmin: adminProfileIds.has(key) };
      existing.communities.push(u.communityId);
      if (u.registeredAt && (!existing.registeredAt || u.registeredAt > existing.registeredAt)) {
        existing.registeredAt = u.registeredAt;
      }
      if (!existing.email && u.profile?.kakao_account?.email) existing.email = u.profile.kakao_account.email;
      byProfile.set(key, existing);
    });

    return res.status(200).json({ users: Array.from(byProfile.values()) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load users.' });
  }
};

export default handler;
