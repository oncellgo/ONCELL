import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getVenues, setVenues } from '../../../lib/dataStore';

type Venue = {
  id: string;
  floor: string;
  name: string;
  code: string;
  availableStart: string;
  availableEnd: string;
  availableDays: number[];
};

const readAll = async (): Promise<Venue[]> => {
  try {
    return ((await getVenues()) || []) as Venue[];
  } catch {
    return [];
  }
};

const writeAll = async (list: Venue[]) => {
  await setVenues(list);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method === 'GET') {
    const list = await readAll();
    return res.status(200).json({ venues: list });
  }

  if (req.method === 'POST') {
    const { floor, name, code, availableStart, availableEnd, availableDays } = req.body as Partial<Venue>;
    if (!floor || !name || !code) return res.status(400).json({ error: 'floor, name, code required.' });
    const list = await readAll();
    const v: Venue = {
      id: `v-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      floor,
      name,
      code,
      availableStart: availableStart || '09:00',
      availableEnd: availableEnd || '22:00',
      availableDays: Array.isArray(availableDays) && availableDays.length > 0 ? availableDays : [0, 1, 2, 3, 4, 5, 6],
    };
    list.push(v);
    await writeAll(list);
    return res.status(200).json({ venue: v });
  }

  if (req.method === 'PATCH') {
    const { id, ...patch } = req.body as Partial<Venue> & { id?: string };
    if (!id) return res.status(400).json({ error: 'id required.' });
    const list = await readAll();
    const idx = list.findIndex((v) => v.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found.' });
    list[idx] = { ...list[idx], ...patch, id };
    await writeAll(list);
    return res.status(200).json({ venue: list[idx] });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) return res.status(400).json({ error: 'id required.' });
    const list = await readAll();
    const next = list.filter((v) => v.id !== id);
    await writeAll(next);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
