import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet } from '../../lib/db';

type Entry = {
  type: 'waitlist';
  name: string;
  email: string;
  time?: string;
  note?: string;
  phone?: string;
  ts: string;
  ua?: string;
};

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const { type, name, email, time, note, phone } = (req.body || {}) as Partial<Entry>;

  if (type !== 'waitlist') {
    return res.status(400).json({ error: 'invalid type' });
  }
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'name and email required' });
  }
  if (!isEmail(email.trim())) {
    return res.status(400).json({ error: 'invalid email' });
  }

  const entry: Entry = {
    type,
    name: name.trim().slice(0, 80),
    email: email.trim().toLowerCase().slice(0, 120),
    time: time?.trim().slice(0, 200),
    note: note?.trim().slice(0, 1000),
    phone: phone?.trim().slice(0, 40),
    ts: new Date().toISOString(),
    ua: (req.headers['user-agent'] || '').toString().slice(0, 200),
  };

  try {
    const list = (await kvGet<Entry[]>('signups')) || [];
    list.push(entry);
    await kvSet('signups', list);
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('[signup] save failed', e);
    return res.status(500).json({ error: 'save failed', errorReason: e?.message || String(e) });
  }
}
