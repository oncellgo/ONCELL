import type { NextApiRequest, NextApiResponse } from 'next';

const providerConfig = {
  kakao: {
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    profileUrl: 'https://kapi.kakao.com/v2/user/me',
    clientId: process.env.KAKAO_CLIENT_ID,
    clientSecret: process.env.KAKAO_CLIENT_SECRET,
    redirectUri: process.env.KAKAO_REDIRECT_URI,
    scope: 'profile_nickname',
  },
  google: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    profileUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    scope: 'openid profile email',
  },
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { provider } = req.query;
  const code = typeof req.query.code === 'string' ? req.query.code : '';

  if (typeof provider !== 'string' || !(provider in providerConfig)) {
    return res.status(400).json({ error: 'Unsupported provider' });
  }

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code.' });
  }

  const config = providerConfig[provider as 'kakao' | 'google'];
  const { tokenUrl, profileUrl, clientId, clientSecret, redirectUri } = config;

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: `${provider} OAuth configuration is missing.` });
  }

  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
  });

  if (clientSecret) {
    tokenParams.set('client_secret', clientSecret);
  }

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json({ error: 'Token request failed.', details: tokenData });
    }

    const profileResponse = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const profileData = await profileResponse.json();
    if (!profileResponse.ok) {
      return res.status(profileResponse.status).json({ error: 'Profile request failed.', details: profileData });
    }

    return res.status(200).json({ provider, token: tokenData, profile: profileData });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error.', details: error instanceof Error ? error.message : error });
  }
};

export default handler;
