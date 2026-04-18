import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommunities, setCommunities, getUsers, setUsers } from '../../lib/dataStore';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const {
    provider,
    profile,
    communityMode,
    communityName,
    selectedCommunityIds,
    nickname,
    realName,
    contact,
  } = req.body as {
    provider: string;
    profile: any;
    communityMode: 'create' | 'find';
    communityName?: string;
    selectedCommunityIds?: string[];
    nickname: string;
    realName: string;
    contact: string;
  };

  if (!provider || !profile || !nickname || !realName || !contact) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const communities = (await getCommunities()) as Array<{ id: string; name: string; adminProfileId?: string; joinApprovalMode?: 'auto' | 'admin' }>;
    const users = (await getUsers()) as Array<any>;

    let communityId: string | undefined;
    let communityLabel = '';
    let joinApprovalMode: 'auto' | 'admin' = 'auto';
    let newUsers: Array<any> = [];

    if (communityMode === 'create') {
      if (!communityName || communityName.trim().length === 0) {
        return res.status(400).json({ error: 'Community name is required.' });
      }
      const normalized = communityName.trim();
      const existing = communities.find((item) => item.name.toLowerCase() === normalized.toLowerCase());
      if (existing) {
        communityId = existing.id;
        communityLabel = existing.name;
        joinApprovalMode = existing.joinApprovalMode || 'auto';
      } else {
        const adminProfileId = profile.id ? `${provider}-${profile.id}` : profile.kakao_account?.email || profile.properties?.nickname || undefined;
        const newCommunity = {
          id: `community-${Date.now()}`,
          name: normalized,
          adminProfileId,
          joinApprovalMode: 'auto' as const,
        };
        communities.push(newCommunity);
        communityId = newCommunity.id;
        communityLabel = newCommunity.name;
        joinApprovalMode = newCommunity.joinApprovalMode;
        await setCommunities(communities);
      }

      const profileId = profile.id ? `${provider}-${profile.id}` : profile.kakao_account?.email || profile.properties?.nickname || `unknown-${Date.now()}`;
      const userId = `registration-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const membershipStatus = joinApprovalMode === 'admin' ? 'pending' : 'active';
      const userData = {
        userId,
        provider,
        providerProfileId: profileId,
        communityId,
        communityName: communityLabel,
        nickname,
        realName,
        contact,
        profile,
        membershipStatus,
        registeredAt: new Date().toISOString(),
      };

      newUsers = [userData];
    } else {
      const selectedIds = Array.isArray(selectedCommunityIds) ? selectedCommunityIds : [];
      if (selectedIds.length === 0) {
        return res.status(400).json({ error: 'Selected community is required.' });
      }
      if (selectedIds.length > 3) {
        return res.status(400).json({ error: '최대 3개의 공동체를 선택할 수 있습니다.' });
      }

      const profileId = profile.id ? `${provider}-${profile.id}` : profile.kakao_account?.email || profile.properties?.nickname || `unknown-${Date.now()}`;
      newUsers = selectedIds.map((id) => {
        const selected = communities.find((item) => item.id === id);
        if (!selected) {
          throw new Error(`Community not found: ${id}`);
        }
        return {
          userId: `registration-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          provider,
          providerProfileId: profileId,
          communityId: selected.id,
          communityName: selected.name,
          nickname,
          realName,
          contact,
          profile,
          membershipStatus: selected.joinApprovalMode === 'admin' ? 'pending' : 'active',
          registeredAt: new Date().toISOString(),
        };
      });
    }

    users.push(...newUsers);

    await setUsers(users);

    return res.status(200).json({ message: '가입되었습니다.', users: newUsers, user: newUsers[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to save registration.' });
  }
};

export default handler;
