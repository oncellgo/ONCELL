import type { NextApiRequest, NextApiResponse } from 'next';
import { getSignupApprovals, setSignupApprovals } from '../../../lib/dataStore';

/**
 * 회원 탈퇴 — 본인 요청. admin 인증 없이 profileId 본인이 호출.
 *
 * 처리:
 *  - signup_approvals[profileId].status = 'withdrawn'
 *  - withdrawReason, withdrawnAt 저장
 *  - 프로필(realName/contact) 등 데이터는 예약 이력 보존 목적으로 유지
 *  - 차단(blocked) 과 달리 재가입 시 복구 허용
 */

type Approval = {
  profileId: string;
  provider: string;
  nickname: string;
  email: string;
  realName?: string;
  contact?: string;
  firstLoginAt: string;
  lastLoginAt: string;
  loginCount: number;
  status: 'pending' | 'approved' | 'rejected' | 'blocked' | 'withdrawn';
  withdrawReason?: string;
  withdrawnAt?: string;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const { profileId, reason } = req.body as { profileId?: string; reason?: string };
  if (!profileId) return res.status(400).json({ error: 'profileId required.' });
  try {
    const list = ((await getSignupApprovals()) || []) as Approval[];
    const idx = list.findIndex((a) => a.profileId === profileId);
    if (idx < 0) return res.status(404).json({ error: 'profile not found' });
    // 차단된 계정은 본인이 탈퇴 요청하더라도 상태 유지 (관리자 이력 보존).
    if (list[idx].status === 'blocked') {
      return res.status(403).json({ error: 'blocked' });
    }
    list[idx].status = 'withdrawn';
    list[idx].withdrawReason = (reason || '').trim().slice(0, 500);
    list[idx].withdrawnAt = new Date().toISOString();
    await setSignupApprovals(list);
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('[withdraw]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
};

export default handler;
