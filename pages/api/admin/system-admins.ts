import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getSystemAdmins, setSystemAdmins } from '../../../lib/dataStore';

type File = { profileIds: string[] };

const load = async (): Promise<File> => {
  try {
    const parsed = (await getSystemAdmins()) as File;
    return { profileIds: Array.isArray(parsed?.profileIds) ? parsed.profileIds : [] };
  } catch {
    return { profileIds: [] };
  }
};

const save = async (file: File) => setSystemAdmins(file);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  const file = await load();

  if (req.method === 'GET') {
    return res.status(200).json(file);
  }

  if (req.method === 'POST') {
    const { profileId } = req.body as { profileId?: string };
    if (!profileId) return res.status(400).json({ error: 'profileId is required.' });
    if (file.profileIds.includes(profileId)) return res.status(200).json(file);
    file.profileIds.push(profileId);
    await save(file);
    return res.status(200).json(file);
  }

  if (req.method === 'DELETE') {
    const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : (req.body as any)?.profileId;
    if (!profileId) return res.status(400).json({ error: 'profileId is required.' });
    if (profileId === ok) return res.status(400).json({ error: '자기 자신은 제거할 수 없습니다.' });
    file.profileIds = file.profileIds.filter((id) => id !== profileId);
    await save(file);
    return res.status(200).json(file);
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
