import type { NextApiRequest, NextApiResponse } from 'next';
import { joinCommunity, getCommunityById } from '../../../../lib/community';
import { db, kvGet } from '../../../../lib/db';

const DEFAULT_COMMUNITY_LIMIT = 1;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  const { profileId } = (req.body || {}) as { profileId?: string };
  if (!id) return res.status(400).json({ error: 'community id required' });
  if (!profileId) return res.status(401).json({ error: 'profileId required' });

  try {
    const community = await getCommunityById(id);
    if (!community) return res.status(404).json({ error: 'community not found' });

    // 1인 N공동체 한도 체크
    const settings = (await kvGet<{ communityJoinLimit?: number }>('settings')) || {};
    const limit = Number(settings.communityJoinLimit) || DEFAULT_COMMUNITY_LIMIT;
    const { count } = await db
      .from('oncell_community_members')
      .select('community_id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('status', 'approved');
    const currentCount = count || 0;
    // 이미 이 공동체 멤버라면 통과 (idempotent)
    const { data: existing } = await db
      .from('oncell_community_members')
      .select('community_id')
      .eq('profile_id', profileId)
      .eq('community_id', id)
      .eq('status', 'approved')
      .maybeSingle();
    if (!existing && currentCount >= limit) {
      return res.status(400).json({
        error: 'community limit exceeded',
        errorReason: `공동체 가입 한도 ${limit}개 초과`,
      });
    }

    const result = await joinCommunity(id, profileId);
    return res.status(200).json({ ok: true, status: result.status });
  } catch (e: any) {
    console.error('[api/communities/:id/join]', e);
    return res.status(500).json({ error: 'join failed', errorReason: e?.message || String(e) });
  }
}
