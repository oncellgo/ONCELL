import type { NextApiRequest, NextApiResponse } from 'next';
import { getSignupApprovals, setSignupApprovals } from '../../../lib/dataStore';

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
  return res.status(200).json({ approval: list[idx] });
};

export default handler;
