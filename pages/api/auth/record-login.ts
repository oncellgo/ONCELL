import type { NextApiRequest, NextApiResponse } from 'next';
import { getSignupApprovals, setSignupApprovals, getSettings } from '../../../lib/dataStore';

type Approval = {
  profileId: string;
  provider: string;
  nickname: string;
  email: string;
  realName?: string;
  contact?: string;
  privacyConsent?: boolean;
  privacyConsentAt?: string;
  firstLoginAt: string;
  lastLoginAt: string;
  loginCount: number;
  status: 'pending' | 'approved' | 'rejected' | 'blocked' | 'withdrawn';
  withdrawReason?: string;
  withdrawnAt?: string;
};

type SignupField = 'realName' | 'contact' | 'privacyConsent';
type Settings = { signupApproval?: 'auto' | 'admin'; signupRequiredFields?: Array<'realName' | 'contact'> };

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
  if (required.includes('privacyConsent') && !approval.privacyConsent) missing.push('privacyConsent');
  return missing;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { profileId, provider, nickname, email, realName, privacyConsent } = req.body as Partial<Approval>;
  if (!profileId) return res.status(400).json({ error: 'profileId required.' });

  const settings = await readSettings();
  // ONCELL 셀 모델: SSO 즉시 일반회원. 사이트 가입 승인 단계 폐지.
  const approvalMode: 'auto' | 'admin' = 'auto';
  // 실명·연락처는 예약 시점(RequiredInfoModal) 에 수집하므로 기본 required 에서 제외.
  // 관리자가 settings.signupRequiredFields 에 명시한 경우에만 가입 시 필수.
  const configured: SignupField[] = Array.isArray(settings.signupRequiredFields)
    ? settings.signupRequiredFields.filter((f): f is 'realName' | 'contact' => f === 'realName' || f === 'contact')
    : [];
  // 개인정보 수집·이용 동의(privacyConsent) 는 법적 의무라 항상 required.
  const required: SignupField[] = Array.from(new Set<SignupField>([...configured, 'privacyConsent']));

  const list = await readApprovals();
  const now = new Date().toISOString();
  const idx = list.findIndex((a) => a.profileId === profileId);

  // 차단된 profileId 는 로그인/재가입 불가 — lastLoginAt 갱신도 안 함.
  if (idx >= 0 && list[idx].status === 'blocked') {
    return res.status(403).json({ error: 'blocked', approval: list[idx], approvalMode, requiredFields: required, missingFields: [] });
  }
  // 탈퇴 사용자는 approval row 가 이미 파기되어 idx === -1 → 아래 신규 가입 분기로 자연스럽게 이어짐.

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
      status: 'approved',
    };
    // 로그인 페이지에서 사전 동의했으면 신규 approval 에 바로 반영
    if (privacyConsent === true) {
      entry.privacyConsent = true;
      entry.privacyConsentAt = now;
    }
    list.push(entry);
    await writeApprovals(list);
    return res.status(200).json({ approval: entry, approvalMode, requiredFields: required, missingFields: computeMissingFields(entry, required) });
  }

  // Existing user: update last login + count, preserve status
  list[idx].lastLoginAt = now;
  list[idx].loginCount = (list[idx].loginCount || 0) + 1;
  // 기존 사용자가 사전 동의 모달로 첫 동의한 경우 저장
  if (privacyConsent === true && !list[idx].privacyConsent) {
    list[idx].privacyConsent = true;
    list[idx].privacyConsentAt = now;
  }
  if (nickname && !list[idx].nickname) list[idx].nickname = nickname;
  if (email && !list[idx].email) list[idx].email = email;
  if (realName && !list[idx].realName) list[idx].realName = realName;
  await writeApprovals(list);
  return res.status(200).json({ approval: list[idx], approvalMode, requiredFields: required, missingFields: computeMissingFields(list[idx], required) });
};

export default handler;
