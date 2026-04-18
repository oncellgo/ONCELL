import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getSignupApprovals, setSignupApprovals } from '../../../lib/dataStore';

type Approval = {
  profileId: string;
  provider: string;
  nickname: string;
  email: string;
  realName?: string;
  firstLoginAt: string;
  lastLoginAt: string;
  loginCount: number;
  status: 'pending' | 'approved' | 'rejected';
};

const readAll = async (): Promise<Approval[]> => {
  try {
    return ((await getSignupApprovals()) || []) as Approval[];
  } catch {
    return [];
  }
};

const writeAll = (list: Approval[]) => setSignupApprovals(list);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method === 'GET') {
    const list = await readAll();
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;
    const filtered = statusFilter ? list.filter((a) => a.status === statusFilter) : list;
    return res.status(200).json({ approvals: filtered });
  }

  if (req.method === 'PATCH') {
    const { profileIds, action } = req.body as { profileIds?: string[]; action?: 'approve' | 'reject' };
    if (!Array.isArray(profileIds) || profileIds.length === 0 || (action !== 'approve' && action !== 'reject')) {
      return res.status(400).json({ error: 'profileIds[] and action(approve/reject) required.' });
    }
    const list = await readAll();
    let updated = 0;
    for (let i = 0; i < list.length; i++) {
      if (profileIds.includes(list[i].profileId)) {
        list[i].status = action === 'approve' ? 'approved' : 'rejected';
        updated++;
      }
    }
    await writeAll(list);
    return res.status(200).json({ ok: true, updated });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
