import type { NextApiRequest, NextApiResponse } from 'next';
import { getSignupApprovals, setSignupApprovals, getSettings } from '../../../lib/dataStore';

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

type SignupField = 'realName' | 'contact';
type Settings = { signupApproval?: 'auto' | 'admin'; signupRequiredFields?: SignupField[] };

const readApprovals = async (): Promise<Approval[]> => {
  try { return ((await getSignupApprovals()) || []) as Approval[]; } catch { return []; }
};
const writeApprovals = (list: Approval[]) => setSignupApprovals(list);

const readSettings = async (): Promise<Settings> => {
  try { return ((await getSettings()) || {}) as Settings; } catch { return {}; }
};

const computeMissingFields = (approval: Approval, required: SignupField[]): SignupField[] => {
  const missing: SignupField[] = [];
  if (required.includes('realName') && !approval.realName) missing.push('realName');
  if (required.includes('contact') && !approval.contact) missing.push('contact');
  return missing;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { profileId, provider, nickname, email, realName } = req.body as Partial<Approval>;
  if (!profileId) return res.status(400).json({ error: 'profileId required.' });

  const settings = await readSettings();
  const approvalMode: 'auto' | 'admin' = settings.signupApproval === 'admin' ? 'admin' : 'auto';
  const required: SignupField[] = Array.isArray(settings.signupRequiredFields)
    ? settings.signupRequiredFields.filter((f): f is SignupField => f === 'realName' || f === 'contact')
    : ['realName', 'contact'];

  const list = await readApprovals();
  const now = new Date().toISOString();
  const idx = list.findIndex((a) => a.profileId === profileId);

  // 차단된 profileId 는 로그인/재가입 불가 — lastLoginAt 갱신도 안 함.
  if (idx >= 0 && list[idx].status === 'blocked') {
    return res.status(403).json({ error: 'blocked', approval: list[idx], approvalMode, requiredFields: required, missingFields: [] });
  }

  // 자진 탈퇴 후 재로그인 — 자동/관리자 승인 모드에 따라 복구. withdrawReason 은 이력 유지.
  if (idx >= 0 && list[idx].status === 'withdrawn') {
    list[idx].status = approvalMode === 'admin' ? 'pending' : 'approved';
  }

  if (idx === -1) {
    const entry: Approval = {
      profileId,
      provider: provider || 'unknown',
      nickname: nickname || '',
      email: email || '',
      realName: realName || '',
      firstLoginAt: now,
      lastLoginAt: now,
      loginCount: 1,
      status: approvalMode === 'admin' ? 'pending' : 'approved',
    };
    list.push(entry);
    await writeApprovals(list);
    return res.status(200).json({ approval: entry, approvalMode, requiredFields: required, missingFields: computeMissingFields(entry, required) });
  }

  // Existing user: update last login + count, preserve status
  list[idx].lastLoginAt = now;
  list[idx].loginCount = (list[idx].loginCount || 0) + 1;
  if (nickname && !list[idx].nickname) list[idx].nickname = nickname;
  if (email && !list[idx].email) list[idx].email = email;
  if (realName && !list[idx].realName) list[idx].realName = realName;
  await writeApprovals(list);
  return res.status(200).json({ approval: list[idx], approvalMode, requiredFields: required, missingFields: computeMissingFields(list[idx], required) });
};

export default handler;
