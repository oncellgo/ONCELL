import type { NextApiRequest, NextApiResponse } from 'next';
import { getUsers } from '../../lib/dataStore';

type UserEntry = {
  providerProfileId: string;
  nickname?: string;
  profile?: any;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
  const nickname = typeof req.query.nickname === 'string' ? req.query.nickname : undefined;
  const email = typeof req.query.email === 'string' ? req.query.email : undefined;

  if (!profileId) {
    return res.status(400).json({ error: 'Missing profileId query parameter.' });
  }

  try {
    const users = (await getUsers()) as UserEntry[];

    const providerPrefix = profileId.includes('-') ? profileId.split('-')[0] : profileId;
    const userEntries = users.filter((entry) => {
      const exactMatch = entry.providerProfileId === profileId;
      const nicknameFallback = nickname && providerPrefix && entry.providerProfileId.startsWith(`${providerPrefix}-`) && entry.nickname === nickname;
      const emailFallback = email && entry.profile?.kakao_account?.email === email;
      return exactMatch || nicknameFallback || emailFallback;
    });

    return res.status(200).json({ userEntries });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load user entries.' });
  }
};

export default handler;
