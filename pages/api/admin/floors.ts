import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getFloors, setFloors } from '../../../lib/dataStore';

const sortFloors = (list: string[]): string[] => {
  return [...new Set(list)].sort((a, b) => {
    const na = Number((a.match(/(\d+)/) || [])[1] || 0);
    const nb = Number((b.match(/(\d+)/) || [])[1] || 0);
    return na - nb;
  });
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    return res.status(200).json({ floors: await getFloors() });
  }

  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method === 'POST') {
    const { floor } = req.body as { floor?: string };
    if (!floor || !floor.trim()) return res.status(400).json({ error: 'floor required.' });
    const label = /^\d+$/.test(floor.trim()) ? `${floor.trim()}F` : floor.trim();
    const list = await getFloors();
    if (list.includes(label)) return res.status(409).json({ error: '이미 존재하는 층입니다.' });
    const next = sortFloors([...list, label]);
    await setFloors(next);
    return res.status(200).json({ floors: next, added: label });
  }

  if (req.method === 'DELETE') {
    const floor = typeof req.query.floor === 'string' ? req.query.floor : null;
    if (!floor) return res.status(400).json({ error: 'floor required.' });
    const list = (await getFloors()).filter((f) => f !== floor);
    await setFloors(list);
    return res.status(200).json({ floors: list });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
