import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionProfileId, clearSession } from '../../../lib/session';
import { getSignupApprovals, getProfiles } from '../../../lib/dataStore';
import { getSystemAdminHref } from '../../../lib/adminGuard';

// GET /api/auth/me — 세션 쿠키에서 신원 도출. 클라이언트 신원 소스.
// 로그인 안 됨 → 401 { authenticated:false }. blocked → 쿠키 제거 + 401.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const profileId = getSessionProfileId(req);
  if (!profileId) return res.status(401).json({ authenticated: false });

  let status: string | undefined;
  let nickname = '';
  let email = '';
  let realName = '';
  try {
    const approvals = ((await getSignupApprovals()) || []) as Array<{ profileId: string; status?: string; nickname?: string; email?: string; realName?: string }>;
    const a = approvals.find((x) => x.profileId === profileId);
    if (a) {
      status = a.status;
      nickname = a.nickname || '';
      email = a.email || '';
      realName = a.realName || '';
    }
  } catch {}

  if (status === 'blocked') {
    clearSession(res);
    return res.status(401).json({ authenticated: false, status: 'blocked' });
  }

  // profiles 미러에서 보강 (approval 에 비어있을 때)
  try {
    const profiles = ((await getProfiles()) || []) as Array<{ profileId: string; nickname?: string; email?: string; realName?: string }>;
    const p = profiles.find((x) => x.profileId === profileId);
    if (p) {
      nickname = nickname || p.nickname || '';
      email = email || p.email || '';
      realName = realName || p.realName || '';
    }
  } catch {}

  let systemAdminHref: string | null = null;
  try {
    systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  } catch {}

  return res.status(200).json({
    authenticated: true,
    profileId,
    nickname,
    email,
    realName,
    status: status || 'approved',
    isSystemAdmin: !!systemAdminHref,
    systemAdminHref,
  });
}
