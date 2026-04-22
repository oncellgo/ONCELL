import type { NextApiRequest, NextApiResponse } from 'next';
import { getSignupApprovals, getSettings } from '../../../lib/dataStore';

type Approval = {
  profileId: string;
  realName?: string;
  contact?: string;
  privacyConsent?: boolean;
  status?: 'pending' | 'approved' | 'rejected' | 'blocked' | 'withdrawn';
};

type SignupField = 'realName' | 'contact' | 'privacyConsent';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : '';
  if (!profileId) return res.status(200).json({ missingFields: [], requiredFields: [] });

  let approvals: Approval[] = [];
  try { approvals = ((await getSignupApprovals()) || []) as Approval[]; } catch {}
  let settings: { signupRequiredFields?: SignupField[] } = {};
  try { settings = (await getSettings()) || {}; } catch {}

  // 개인정보 수집·이용 동의(privacyConsent) 는 법적 의무라 설정과 무관하게 항상 required.
  const configured: SignupField[] = Array.isArray(settings.signupRequiredFields)
    ? settings.signupRequiredFields.filter((f): f is SignupField => f === 'realName' || f === 'contact')
    : ['realName', 'contact'];
  const required: SignupField[] = Array.from(new Set<SignupField>([...configured, 'privacyConsent']));

  const a = approvals.find((x) => x.profileId === profileId);
  const missing: SignupField[] = [];
  if (required.includes('realName') && !a?.realName) missing.push('realName');
  if (required.includes('contact') && !a?.contact) missing.push('contact');
  if (required.includes('privacyConsent') && !a?.privacyConsent) missing.push('privacyConsent');
  const status = a?.status || null;

  return res.status(200).json({ missingFields: missing, requiredFields: required, status });
};

export default handler;
