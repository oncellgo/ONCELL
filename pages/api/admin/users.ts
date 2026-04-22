import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getUsers, getProfiles, getCommunities, getSignupApprovals } from '../../../lib/dataStore';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const [users, profiles, communities, approvals] = await Promise.all([
      getUsers() as Promise<Array<any>>,
      getProfiles() as Promise<Array<any>>,
      getCommunities() as Promise<Array<{ id: string; adminProfileId?: string }>>,
      getSignupApprovals() as Promise<Array<any>>,
    ]);
    const adminProfileIds = new Set(communities.map((c) => c.adminProfileId).filter(Boolean) as string[]);
    const approvalByProfile = new Map<string, any>();
    approvals.forEach((a) => { if (a?.profileId) approvalByProfile.set(a.profileId, a); });

    type Row = {
      profileId: string;
      nickname?: string;
      realName?: string;
      email?: string;
      contact?: string;
      provider?: string;
      communities: string[];
      registeredAt: string | null;
      lastLoginAt: string | null;
      isCommunityAdmin: boolean;
    };
    const byProfile = new Map<string, Row>();
    profiles.forEach((p) => {
      const a = approvalByProfile.get(p.profileId);
      byProfile.set(p.profileId, {
        profileId: p.profileId,
        nickname: p.nickname,
        realName: p.realName || a?.realName,
        email: p.email || a?.email,
        contact: a?.contact,
        provider: p.provider,
        communities: [],
        registeredAt: null,
        lastLoginAt: a?.lastLoginAt || null,
        isCommunityAdmin: adminProfileIds.has(p.profileId),
      });
    });
    users.forEach((u) => {
      const key = u.providerProfileId;
      if (!key) return;
      const a = approvalByProfile.get(key);
      const existing = byProfile.get(key) || {
        profileId: key,
        nickname: u.nickname,
        realName: u.realName || a?.realName,
        email: u.profile?.kakao_account?.email || a?.email,
        contact: a?.contact,
        provider: u.provider,
        communities: [] as string[],
        registeredAt: null as string | null,
        lastLoginAt: a?.lastLoginAt || null,
        isCommunityAdmin: adminProfileIds.has(key),
      };
      existing.communities.push(u.communityId);
      if (u.registeredAt && (!existing.registeredAt || u.registeredAt > existing.registeredAt)) {
        existing.registeredAt = u.registeredAt;
      }
      if (!existing.email && u.profile?.kakao_account?.email) existing.email = u.profile.kakao_account.email;
      if (!existing.contact && a?.contact) existing.contact = a.contact;
      if (!existing.lastLoginAt && a?.lastLoginAt) existing.lastLoginAt = a.lastLoginAt;
      byProfile.set(key, existing);
    });

    return res.status(200).json({ users: Array.from(byProfile.values()) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load users.' });
  }
};

export default handler;
