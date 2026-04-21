import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getSystemAdmins, setSystemAdmins } from '../../../lib/dataStore';

type File = { profileIds: string[]; emails: string[] };

const load = async (): Promise<File> => {
  try {
    const parsed = (await getSystemAdmins()) as any;
    return {
      profileIds: Array.isArray(parsed?.profileIds) ? parsed.profileIds : [],
      emails: Array.isArray(parsed?.emails) ? parsed.emails : [],
    };
  } catch {
    return { profileIds: [], emails: [] };
  }
};

const save = async (file: File) => setSystemAdmins(file);

const normEmail = (s: string) => s.trim().toLowerCase();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  const file = await load();

  if (req.method === 'GET') {
    return res.status(200).json(file);
  }

  if (req.method === 'POST') {
    const { profileId, email } = req.body as { profileId?: string; email?: string };
    if (!profileId && !email) return res.status(400).json({ error: 'profileId 또는 email이 필요합니다.' });
    if (profileId) {
      if (!file.profileIds.includes(profileId)) file.profileIds.push(profileId);
    }
    if (email) {
      const e = normEmail(email);
      if (e && !file.emails.includes(e)) file.emails.push(e);
    }
    await save(file);
    return res.status(200).json(file);
  }

  if (req.method === 'DELETE') {
    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : (req.body as any)?.profileId;
    const email = typeof req.query.email === 'string' ? req.query.email : (req.body as any)?.email;
    if (!profileId && !email) return res.status(400).json({ error: 'profileId 또는 email이 필요합니다.' });
    if (profileId) {
      if (profileId === ok) return res.status(400).json({ error: '자기 자신은 제거할 수 없습니다.' });
      file.profileIds = file.profileIds.filter((id) => id !== profileId);
    }
    if (email) {
      const e = normEmail(email);
      file.emails = file.emails.filter((x) => x !== e);
    }
    await save(file);
    return res.status(200).json(file);
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
