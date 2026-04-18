import type { NextApiRequest, NextApiResponse } from 'next';
import { getProfiles, setProfiles } from '../../lib/dataStore';

type Profile = {
  profileId: string;
  provider: string;
  nickname: string;
  realName: string;
  contact: string;
  email?: string;
  updatedAt: string;
};

const readProfiles = async (): Promise<Profile[]> => {
  try {
    return (await getProfiles()) as Profile[];
  } catch {
    return [];
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const profiles = await readProfiles();

    if (req.method === 'GET') {
      const profileId = typeof req.query.profileId === 'string' ? req.query.profileId : undefined;
      if (!profileId) return res.status(400).json({ error: 'profileId is required.' });
      const profile = profiles.find((p) => p.profileId === profileId) || null;
      return res.status(200).json({ profile });
    }

    if (req.method === 'POST') {
      const { profileId, provider, nickname, realName, contact, email } = req.body as Partial<Profile>;
      if (!profileId || !provider || !realName || !contact) {
        return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
      }

      const now = new Date().toISOString();
      const next: Profile = {
        profileId,
        provider,
        nickname: nickname || '',
        realName,
        contact,
        email: email || '',
        updatedAt: now,
      };
      const index = profiles.findIndex((p) => p.profileId === profileId);
      if (index >= 0) profiles[index] = next;
      else profiles.push(next);

      await setProfiles(profiles);
      return res.status(200).json({ profile: next });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to handle profile.' });
  }
};

export default handler;
