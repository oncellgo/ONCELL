import type { NextApiRequest, NextApiResponse } from 'next';

const providerConfig = {
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    clientId: process.env.KAKAO_CLIENT_ID,
    redirectUri: process.env.KAKAO_REDIRECT_URI,
    scope: 'profile_nickname',
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: process.env.GOOGLE_CLIENT_ID,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    scope: 'openid profile email',
  },
};

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  const { provider } = req.query;
  if (typeof provider !== 'string' || !(provider in providerConfig)) {
    res.status(400).json({ error: 'Unsupported provider' });
    return;
  }

  const config = providerConfig[provider as 'kakao' | 'google'];
  const clientId = config.clientId;
  const redirectUri = config.redirectUri;

  if (!clientId || !redirectUri) {
    res.status(500).json({ error: `${provider} OAuth configuration is missing.` });
    return;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: config.scope,
  });

  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
  }

  res.redirect(`${config.authorizeUrl}?${params.toString()}`);
};

export default handler;
