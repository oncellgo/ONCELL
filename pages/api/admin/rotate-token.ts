import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { requireSystemAdminApi, setActiveAdminToken } from '../../../lib/adminGuard';

/**
 * POST /api/admin/rotate-token
 * 시스템 관리자만 호출 가능. 새 ADMIN_ACCESS_TOKEN을 생성·저장하고 반환.
 * 호출 후 클라이언트는 모든 admin URL의 ?k= 값을 새 토큰으로 교체해야 함.
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const profileId = await requireSystemAdminApi(req, res);
  if (!profileId) return; // requireSystemAdminApi이 이미 응답 처리

  const newToken = randomBytes(32).toString('hex');
  try {
    await setActiveAdminToken(newToken);
    return res.status(200).json({ token: newToken, rotatedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('rotate-token failed:', error?.message || error);
    return res.status(500).json({ error: '토큰 재설정에 실패했습니다.' });
  }
};

export default handler;
