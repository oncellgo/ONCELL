import { db } from './db';

export type CommunityRow = {
  id: string;
  name: string;
  description: string | null;
  admin_profile_id: string;
  approval_mode: 'auto' | 'manual';
  cell_join_limit: number;
  created_at: string;
};

export async function listCommunities(): Promise<CommunityRow[]> {
  const { data, error } = await db.from('oncell_communities').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as CommunityRow[];
}

export async function getCommunityById(id: string): Promise<CommunityRow | null> {
  const { data, error } = await db.from('oncell_communities').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as CommunityRow | null) || null;
}

export async function isCommunityMember(communityId: string, profileId: string): Promise<boolean> {
  const { data, error } = await db
    .from('oncell_community_members')
    .select('status')
    .eq('community_id', communityId)
    .eq('profile_id', profileId)
    .eq('status', 'approved')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function isCommunityAdmin(communityId: string, profileId: string): Promise<boolean> {
  const c = await getCommunityById(communityId);
  return !!c && c.admin_profile_id === profileId;
}

export async function getMyCommunities(profileId: string): Promise<CommunityRow[]> {
  const { data: members, error: mErr } = await db
    .from('oncell_community_members')
    .select('community_id')
    .eq('profile_id', profileId)
    .eq('status', 'approved');
  if (mErr) throw mErr;
  const ids = (members || []).map((m: any) => m.community_id);
  if (ids.length === 0) return [];
  const { data, error } = await db.from('oncell_communities').select('*').in('id', ids);
  if (error) throw error;
  return (data || []) as CommunityRow[];
}

export async function joinCommunity(communityId: string, profileId: string): Promise<{ status: 'pending' | 'approved' }> {
  const c = await getCommunityById(communityId);
  if (!c) throw new Error('community not found');
  const status = c.approval_mode === 'manual' ? 'pending' : 'approved';
  const { error } = await db
    .from('oncell_community_members')
    .upsert({ community_id: communityId, profile_id: profileId, status }, { onConflict: 'community_id,profile_id' });
  if (error) throw error;
  return { status };
}

// 공동체관리자 자동 멤버 등록 — admin이지만 members에 안 들어있으면 즉시 추가
export async function ensureAdminMembership(communityId: string, profileId: string): Promise<void> {
  const c = await getCommunityById(communityId);
  if (!c || c.admin_profile_id !== profileId) return;
  await db
    .from('oncell_community_members')
    .upsert({ community_id: communityId, profile_id: profileId, status: 'approved' }, { onConflict: 'community_id,profile_id' });
}

export async function getCommunityMemberCount(communityId: string): Promise<number> {
  const { count, error } = await db
    .from('oncell_community_members')
    .select('profile_id', { count: 'exact', head: true })
    .eq('community_id', communityId)
    .eq('status', 'approved');
  if (error) throw error;
  return count || 0;
}
