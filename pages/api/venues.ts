import type { NextApiRequest, NextApiResponse } from 'next';
import { getVenues } from '../../lib/dataStore';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const venues = await getVenues();
    return res.status(200).json({ venues });
  } catch {
    return res.status(200).json({ venues: [] });
  }
};

export default handler;
