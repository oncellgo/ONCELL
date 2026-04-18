import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSystemAdminApi } from '../../../lib/adminGuard';
import { getVenueBlockGroups, setVenueBlockGroups } from '../../../lib/dataStore';

type Slot = { dow: number; startMin: number };

type Group = {
  id: string;
  venueId: string;
  slots?: Slot[];
  // Legacy fields (still supported for old data)
  days?: number[];
  startMin?: number;
  endMin?: number;
  endDate: string | null;
  reason?: string;
  createdAt: string;
};

const readGroups = async (): Promise<Group[]> => {
  try { return ((await getVenueBlockGroups()) || []) as Group[]; } catch { return []; }
};
const writeGroups = (list: Group[]) => setVenueBlockGroups(list);

const expandToSlots = (group: Group): Slot[] => {
  if (group.slots && group.slots.length > 0) return group.slots;
  const out: Slot[] = [];
  const SLOT_MIN = 30;
  if (group.days && typeof group.startMin === 'number' && typeof group.endMin === 'number') {
    for (const dow of group.days) {
      for (let m = group.startMin; m < group.endMin; m += SLOT_MIN) {
        out.push({ dow, startMin: m });
      }
    }
  }
  return out;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const ok = await requireSystemAdminApi(req, res);
  if (!ok) return;

  if (req.method === 'GET') {
    return res.status(200).json({ groups: await readGroups() });
  }

  if (req.method === 'POST') {
    const { venueId, slots, endDate, reason } = req.body as Partial<Group>;
    if (!venueId || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'venueId, slots[] 필수입니다.' });
    }
    const group: Group = {
      id: `g-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      venueId,
      slots,
      endDate: endDate || null,
      reason: reason || '',
      createdAt: new Date().toISOString(),
    };
    const groups = await readGroups();
    groups.push(group);
    await writeGroups(groups);
    return res.status(200).json({ group });
  }

  if (req.method === 'PATCH') {
    const { id, venueId, slots, endDate, reason } = req.body as Partial<Group> & { id?: string };
    if (!id) return res.status(400).json({ error: 'id 필요' });
    const groups = await readGroups();
    const idx = groups.findIndex((g) => g.id === id);
    if (idx === -1) return res.status(404).json({ error: '그룹을 찾을 수 없습니다.' });
    const updated: Group = {
      ...groups[idx],
      ...(venueId !== undefined ? { venueId } : {}),
      ...(Array.isArray(slots) ? { slots, days: undefined, startMin: undefined, endMin: undefined } : {}),
      ...(endDate !== undefined ? { endDate: endDate || null } : {}),
      ...(reason !== undefined ? { reason } : {}),
    };
    const effSlots = expandToSlots(updated);
    if (effSlots.length === 0) return res.status(400).json({ error: '슬롯을 하나 이상 선택하세요.' });
    groups[idx] = updated;
    await writeGroups(groups);
    return res.status(200).json({ group: updated });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) return res.status(400).json({ error: 'id 필요' });
    const groups = (await readGroups()).filter((g) => g.id !== id);
    await writeGroups(groups);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

export default handler;
