import type { NextApiRequest, NextApiResponse } from 'next';
import { getCommunityById, getCommunityMemberCount, isCommunityMember, ensureAdminMembership } from '../../../../lib/community';
import { db } from '../../../../lib/db';
import { getProfiles } from '../../../../lib/dataStore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
  if (!id) return res.status(400).json({ error: 'community id required' });

  try {
    const community = await getCommunityById(id);
    if (!community) return res.status(404).json({ error: 'community not found' });

    // 공동체관리자가 멤버에 없으면 자동 등록
    if (profileId === community.admin_profile_id) {
      await ensureAdminMembership(id, profileId);
    }

    const memberCount = await getCommunityMemberCount(id);
    const isMember = profileId ? await isCommunityMember(id, profileId) : false;
    const isAdmin = profileId === community.admin_profile_id;

    // 산하 셀 (모든 셀 — 누구나 셀 목록 정도는 봄)
    const { data: cells } = await db
      .from('oncell_cells')
      .select('id, name, owner_profile_id, enabled_modes, member_count, description, approval_mode')
      .eq('community_id', id)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    // admin display name
    const allProfiles = await getProfiles().catch(() => [] as any[]);
    const adminProfile = (allProfiles as Array<any>).find((p) => p.profileId === community.admin_profile_id);
    const adminDisplayName = adminProfile?.realName || adminProfile?.nickname || community.admin_profile_id;

    return res.status(200).json({
      community: { ...community, adminDisplayName },
      memberCount,
      isMember,
      isAdmin,
      cells: cells || [],
    });
  } catch (e: any) {
    console.error('[api/communities/:id]', e);
    return res.status(500).json({ error: 'fetch failed', errorReason: e?.message || String(e) });
  }
}
