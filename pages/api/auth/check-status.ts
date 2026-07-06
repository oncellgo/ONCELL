import type { NextApiRequest, NextApiResponse } from 'next';
import { getSignupApprovals } from '../../../lib/dataStore';

/**
 * OAuth 완료 후, approval DB 에 기록을 남기지 않고 현재 상태만 조회.
 * 법적 근거: "수집 이전 단순 조회" 는 개인정보 수집에 해당하지 않음.
 *
 * GET /api/auth/check-status?profileId=...
 * 응답:
 *   {
 *     exists: boolean,            // approval row 존재 여부
 *     privacyConsent: boolean,    // 개인정보 수집·이용 동의 여부
 *     status: 'pending'|'approved'|'rejected'|'blocked'|null
 *   }
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
  if (!profileId) return res.status(400).json({ error: 'profileId required.' });
  try {
    const list = ((await getSignupApprovals()) || []) as Array<{ profileId: string; privacyConsent?: boolean; status?: string; nickname?: string }>;
    const a = list.find((x) => x.profileId === profileId);
    return res.status(200).json({
      exists: !!a,
      privacyConsent: !!(a?.privacyConsent),
      // 이메일 형태 닉네임은 유효한 별칭으로 보지 않음 → 완료 화면에서 별칭 재입력 유도
      hasNickname: !!(a?.nickname && a.nickname.trim() && !a.nickname.includes('@')),
      status: a?.status || null,
    });
  } catch (e: any) {
    console.error('[check-status]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
};

export default handler;
