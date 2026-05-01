import type { NextApiRequest, NextApiResponse } from 'next';
import { getCellByInviteToken, isCellMember } from '../../../../lib/cells';
import { isCommunityMember, joinCommunity, getCommunityById } from '../../../../lib/community';
import { db, kvGet } from '../../../../lib/db';

const DEFAULT_INDEPENDENT_CELL_LIMIT = 3;
const DEFAULT_COMMUNITY_LIMIT = 1;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // 셀 정보 미리보기 (가입 전 화면용)
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) return res.status(400).json({ error: 'token required' });
    try {
      const cell = await getCellByInviteToken(token);
      if (!cell || cell.archived_at) return res.status(404).json({ error: 'invalid token' });
      let community = null;
      if (cell.community_id) community = await getCommunityById(cell.community_id);
      return res.status(200).json({
        cell: {
          id: cell.id,
          name: cell.name,
          description: cell.description,
          invite_message: cell.invite_message,
          enabled_modes: cell.enabled_modes,
          member_count: cell.member_count,
          approval_mode: cell.approval_mode,
          community_id: cell.community_id,
        },
        community: community ? { id: community.id, name: community.name } : null,
      });
    } catch (e: any) {
      console.error('[join/token GET]', e);
      return res.status(500).json({ error: 'failed', errorReason: e?.message || String(e) });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const { profileId, joinCommunity: agreeCommunity } = (req.body || {}) as { profileId?: string; joinCommunity?: boolean };
  if (!token) return res.status(400).json({ error: 'token required' });
  if (!profileId) return res.status(401).json({ error: 'profileId required' });

  try {
    const cell = await getCellByInviteToken(token);
    if (!cell || cell.archived_at) return res.status(404).json({ error: 'invalid token' });

    // 이미 멤버면 idempotent
    if (await isCellMember(cell.id, profileId)) {
      return res.status(200).json({ ok: true, alreadyMember: true, cell: { id: cell.id, name: cell.name } });
    }

    // 공동체 셀이면 공동체 멤버십 확인
    if (cell.community_id) {
      const isMember = await isCommunityMember(cell.community_id, profileId);
      if (!isMember) {
        if (!agreeCommunity) {
          return res.status(409).json({
            error: 'community consent required',
            errorReason: '이 셀은 공동체 셀입니다. 공동체 가입 동의가 필요합니다.',
            needsCommunityConsent: true,
            communityId: cell.community_id,
          });
        }
        // 공동체 한도 체크 + 가입
        const settings = (await kvGet<{ communityJoinLimit?: number }>('settings')) || {};
        const cLimit = Number(settings.communityJoinLimit) || DEFAULT_COMMUNITY_LIMIT;
        const { count: cCount } = await db
          .from('oncell_community_members')
          .select('community_id', { count: 'exact', head: true })
          .eq('profile_id', profileId)
          .eq('status', 'approved');
        if ((cCount || 0) >= cLimit) {
          return res.status(400).json({
            error: 'community limit exceeded',
            errorReason: `공동체 가입 한도 ${cLimit}개 초과 — 다른 공동체 탈퇴 후 시도해주세요`,
          });
        }
        await joinCommunity(cell.community_id, profileId);
      }
    } else {
      // 독립 셀 한도 체크
      const settings = (await kvGet<{ independentCellLimit?: number }>('settings')) || {};
      const limit = Number(settings.independentCellLimit) || DEFAULT_INDEPENDENT_CELL_LIMIT;
      const { data: myCells } = await db
        .from('oncell_cell_members')
        .select('cell_id, oncell_cells!inner(community_id)')
        .eq('profile_id', profileId)
        .eq('status', 'approved');
      const independentCount = (myCells || []).filter((m: any) => !m.oncell_cells?.community_id).length;
      if (independentCount >= limit) {
        return res.status(400).json({
          error: 'cell limit exceeded',
          errorReason: `독립 셀 한도 ${limit}개 초과`,
        });
      }
    }

    // 셀 가입
    const status = cell.approval_mode === 'manual' ? 'pending' : 'approved';
    const { error: insertErr } = await db
      .from('oncell_cell_members')
      .insert({ cell_id: cell.id, profile_id: profileId, status });
    if (insertErr) throw insertErr;

    // member_count 증가 (auto 승인일 때만)
    if (status === 'approved') {
      await db.from('oncell_cells').update({ member_count: (cell.member_count || 0) + 1 }).eq('id', cell.id);
    }

    return res.status(200).json({ ok: true, status, cell: { id: cell.id, name: cell.name } });
  } catch (e: any) {
    console.error('[join/token POST]', e);
    return res.status(500).json({ error: 'join failed', errorReason: e?.message || String(e) });
  }
}
