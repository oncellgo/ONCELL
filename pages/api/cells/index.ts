import type { NextApiRequest, NextApiResponse } from 'next';
import { createCell, countIndependentCellsForUser, EnabledModes } from '../../../lib/cells';
import { isCommunityAdmin } from '../../../lib/community';
import { kvGet } from '../../../lib/db';

const DEFAULT_INDEPENDENT_CELL_LIMIT = 3;

async function getIndependentCellLimit(): Promise<number> {
  try {
    const settings = (await kvGet<{ independentCellLimit?: number }>('settings')) || {};
    const v = Number(settings.independentCellLimit);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_INDEPENDENT_CELL_LIMIT;
  } catch {
    return DEFAULT_INDEPENDENT_CELL_LIMIT;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { profileId, name, enabledModes, description, inviteMessage, approvalMode, communityId } = (req.body || {}) as {
    profileId?: string;
    name?: string;
    enabledModes?: EnabledModes;
    description?: string;
    inviteMessage?: string;
    approvalMode?: 'auto' | 'manual';
    communityId?: string;
  };

  if (!profileId) return res.status(401).json({ error: 'profileId required' });
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const modes: EnabledModes = enabledModes || {};
  if (!modes.qt && !modes.reading && !modes.memorize && !modes.prayer) {
    return res.status(400).json({ error: 'at least one mode required' });
  }

  // 공동체 셀 생성 — 공동체 admin만 가능
  if (communityId) {
    const isAdmin = await isCommunityAdmin(communityId, profileId);
    if (!isAdmin) {
      return res.status(403).json({
        error: 'not community admin',
        errorReason: '공동체관리자만 공동체 셀을 만들 수 있습니다',
      });
    }
  } else {
    // 독립 셀 한도 체크 (공동체 셀은 별도 한도 적용)
    const limit = await getIndependentCellLimit();
    const current = await countIndependentCellsForUser(profileId);
    if (current >= limit) {
      return res.status(400).json({
        error: 'cell limit exceeded',
        errorReason: `독립 셀 가입 한도 ${limit}개 초과 (현재 ${current}개)`,
      });
    }
  }

  try {
    const cell = await createCell({
      name,
      ownerProfileId: profileId,
      communityId: communityId || null,
      enabledModes: modes,
      approvalMode: approvalMode === 'manual' ? 'manual' : 'auto',
      description,
      inviteMessage,
    });
    return res.status(200).json({ ok: true, cell });
  } catch (e: any) {
    console.error('[api/cells] create failed', e);
    return res.status(500).json({ error: 'create failed', errorReason: e?.message || String(e) });
  }
}
