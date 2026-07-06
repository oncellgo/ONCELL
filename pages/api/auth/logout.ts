import type { NextApiRequest, NextApiResponse } from 'next';
import { clearSession } from '../../../lib/session';

// POST /api/auth/logout — 세션 쿠키 제거.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  clearSession(res);
  return res.status(200).json({ ok: true });
}
