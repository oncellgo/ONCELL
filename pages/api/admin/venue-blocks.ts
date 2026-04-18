import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getVenueBlocks, setVenueBlocks } from '../../../lib/dataStore';

type Block = {
  id: string;
  venueId: string;
  startAt: string;
  endAt: string | null;
  reason?: string;
};

const readAll = async (): Promise<Block[]> => {
  try {
    return ((await getVenueBlocks()) || []) as Block[];
  } catch {
    return [];
  }
};

const writeAll = async (list: Block[]) => {
  await setVenueBlocks(list);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method === 'GET') {
    const list = await readAll();
    return res.status(200).json({ blocks: list });
  }

  if (req.method === 'POST') {
    const { venueId, startAt, endAt, reason } = req.body as Partial<Block>;
    if (!venueId || !startAt) return res.status(400).json({ error: 'venueId, startAt required.' });
    const list = await readAll();
    const b: Block = {
      id: `b-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      venueId,
      startAt,
      endAt: endAt || null,
      reason: reason || '',
    };
    list.push(b);
    await writeAll(list);
    return res.status(200).json({ block: b });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) return res.status(400).json({ error: 'id required.' });
    const list = await readAll();
    const next = list.filter((b) => b.id !== id);
    await writeAll(next);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
