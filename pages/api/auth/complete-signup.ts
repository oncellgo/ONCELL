import type { NextApiRequest, NextApiResponse } from 'next';
import { getSignupApprovals, setSignupApprovals, getProfiles, setProfiles } from '../../../lib/dataStore';

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
  status: 'pending' | 'approved' | 'rejected';
};

type Profile = {
  profileId: string;
  provider: string;
  nickname: string;
  realName: string;
  contact: string;
  email?: string;
  updatedAt: string;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { profileId, realName, contact } = req.body as { profileId?: string; realName?: string; contact?: string };
  if (!profileId) return res.status(400).json({ error: 'profileId required.' });

  let list: Approval[] = [];
  try { list = ((await getSignupApprovals()) || []) as Approval[]; } catch {}

  const idx = list.findIndex((a) => a.profileId === profileId);
  if (idx === -1) return res.status(404).json({ error: 'Approval not found.' });

  if (typeof realName === 'string' && realName.trim()) list[idx].realName = realName.trim();
  if (typeof contact === 'string' && contact.trim()) list[idx].contact = contact.trim();

  await setSignupApprovals(list);

  // kcis_profiles 에도 동일 정보를 upsert — signup_approvals / profiles 가 분리되어
  // 어느 한쪽만 읽는 화면(예: 장소예약 그리드, /api/profile)에서 "(미등록)" 으로 나오는 문제를 근본 차단.
  try {
    const approval = list[idx];
    const profiles = ((await getProfiles()) || []) as Profile[];
    const pIdx = profiles.findIndex((p) => p.profileId === profileId);
    const now = new Date().toISOString();
    const next: Profile = {
      profileId,
      provider: approval.provider || (profileId.includes('-') ? profileId.split('-')[0] : 'unknown'),
      nickname: approval.nickname || '',
      realName: approval.realName || (pIdx >= 0 ? profiles[pIdx].realName : '') || '',
      contact: approval.contact || (pIdx >= 0 ? profiles[pIdx].contact : '') || '',
      email: approval.email || (pIdx >= 0 ? profiles[pIdx].email : '') || '',
      updatedAt: now,
    };
    if (pIdx >= 0) profiles[pIdx] = next;
    else profiles.push(next);
    await setProfiles(profiles);
  } catch (err) {
    console.error('complete-signup: profiles mirror upsert failed:', err);
    // signup_approvals 저장은 이미 성공. mirror 실패는 조용히 로그만 남김.
  }

  return res.status(200).json({ approval: list[idx] });
};

export default handler;
