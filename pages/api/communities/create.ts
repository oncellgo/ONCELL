import type { NextApiRequest, NextApiResponse } from 'next';
import { seedCommunityTemplate } from '../../../lib/communityTemplates';
import { getCommunities, setCommunities, getUsers, setUsers, getWorshipServices, setWorshipServices } from '../../../lib/dataStore';

const computeNextSundayAt11 = (): string => {
  const now = new Date();
  const day = now.getDay();
  const daysUntil = day === 0 ? 7 : (7 - day);
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil, 11, 0, 0, 0);
  return next.toISOString();
};

const seedDefaultSundayService = async (communityId: string, bulletin: any) => {
  try {
    let services: any[] = [];
    try { services = (await getWorshipServices()) as any[]; } catch { services = []; }
    if (!Array.isArray(services)) services = [];
    if (services.some((s) => s.communityId === communityId && (s.name === '주일예배' || s.name === '주일예배 주보'))) return;
    services.push({
      id: `ws-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      communityId,
      name: '주일예배',
      startAt: computeNextSundayAt11(),
      createdAt: new Date().toISOString(),
      bulletin: bulletin ? JSON.parse(JSON.stringify(bulletin)) : null,
      isDefault: true,
    });
    await setWorshipServices(services);
  } catch (e) {
    console.error('seedDefaultSundayService failed', e);
  }
};

type CommunityType = 'cell' | 'department';

type Community = {
  id: string;
  name: string;
  type?: CommunityType;
  adminProfileId?: string;
  joinApprovalMode?: 'auto' | 'admin';
  requireRealName?: boolean;
  timezone?: string;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { name, type, profileId, provider, nickname, email, joinApprovalMode, requireRealName, timezone } = req.body as {
    name?: string;
    type?: CommunityType;
    profileId?: string;
    provider?: string;
    nickname?: string;
    email?: string;
    joinApprovalMode?: 'auto' | 'admin';
    requireRealName?: boolean;
    timezone?: string;
  };

  if (!name || !name.trim()) {
    return res.status(400).json({ error: '공동체 이름을 입력해주세요.' });
  }
  if (!profileId) {
    return res.status(400).json({ error: '로그인이 필요합니다.' });
  }

  try {
    const [communities, users] = await Promise.all([
      getCommunities() as Promise<Community[]>,
      getUsers() as Promise<Array<any>>,
    ]);

    const trimmed = name.trim();
    const existing = communities.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    let community: Community;
    if (existing) {
      community = existing;
      if (!existing.adminProfileId) {
        existing.adminProfileId = profileId;
        await setCommunities(communities);
      }
    } else {
      community = {
        id: `community-${Date.now()}`,
        name: trimmed,
        type,
        adminProfileId: profileId,
        joinApprovalMode: joinApprovalMode === 'admin' ? 'admin' : 'auto',
        requireRealName: requireRealName !== false,
        timezone: timezone || 'Asia/Seoul',
      };
      communities.push(community);
      await setCommunities(communities);
      let seededTemplate: any = null;
      try { seededTemplate = await seedCommunityTemplate(community.id, community.name); } catch (e) { console.error('seedCommunityTemplate failed', e); }
      await seedDefaultSundayService(community.id, seededTemplate);
    }

    const alreadyMember = users.some((u) => u.providerProfileId === profileId && u.communityId === community.id);
    if (!alreadyMember) {
      users.push({
        userId: `registration-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        provider: provider || (profileId.includes('-') ? profileId.split('-')[0] : 'kakao'),
        providerProfileId: profileId,
        communityId: community.id,
        communityName: community.name,
        nickname: nickname || '',
        realName: nickname || '',
        contact: '',
        profile: { id: profileId, kakao_account: { email: email || '' }, properties: { nickname: nickname || '' } },
        membershipStatus: 'active',
        registeredAt: new Date().toISOString(),
      });
      await setUsers(users);
    }

    return res.status(200).json({ community });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: '공동체 생성에 실패했습니다.' });
  }
};

export default handler;
