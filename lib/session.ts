// ---------------------------------------------------------------
// 세션 쿠키 (HMAC 서명 stateless). Node 내장 crypto 만 사용.
//   - 신원(profileId)을 서명된 httpOnly 쿠키에 담아 서버가 도출.
//   - URL/body 의 profileId 를 신뢰하지 않기 위한 기반.
//
// env: SESSION_SECRET (32바이트+ 랜덤). 미설정 시:
//   - getSessionProfileId → null (fail-closed: 미인증 취급)
//   - setSession → throw (호출부에서 Phase1 동안 try/catch 로 감싸 무중단)
// ---------------------------------------------------------------

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { IncomingMessage, ServerResponse } from 'http';

const COOKIE = 'oncell_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일 (초)

const b64 = (b: Buffer) => b.toString('base64url');

const secret = (): string => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET missing or too short');
  return s;
};

const sign = (data: string): string =>
  b64(crypto.createHmac('sha256', secret()).update(data).digest());

// 자체 쿠키 파서 — API(req.cookies 있음)와 SSR(ctx.req: IncomingMessage) 공용.
const parseCookie = (header?: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
};

export function setSession(res: NextApiResponse | ServerResponse, profileId: string): void {
  const payload = b64(Buffer.from(JSON.stringify({ pid: profileId, iat: Date.now(), v: 1 })));
  const token = `${payload}.${sign(payload)}`; // secret 없으면 여기서 throw
  const attrs = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${MAX_AGE}`,
    'SameSite=Lax',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function getSessionProfileId(req: NextApiRequest | IncomingMessage): string | null {
  try {
    const raw = parseCookie(req.headers.cookie)[COOKIE];
    if (!raw) return null;
    const dot = raw.lastIndexOf('.');
    if (dot <= 0) return null;
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const expected = sign(payload); // secret 없으면 throw → catch → null
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const { pid, iat } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { pid?: string; iat?: number };
    if (!pid || typeof iat !== 'number' || Date.now() - iat > MAX_AGE * 1000) return null;
    return pid;
  } catch {
    return null;
  }
}

// API 핸들러용: 세션 없으면 401 응답 후 null 반환. 호출부는 `const me = requireSession(req,res); if(!me) return;`
export function requireSession(req: NextApiRequest, res: NextApiResponse): string | null {
  const pid = getSessionProfileId(req);
  if (!pid) { res.status(401).json({ error: 'unauthorized' }); return null; }
  return pid;
}

export function clearSession(res: NextApiResponse | ServerResponse): void {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax` +
      (process.env.NODE_ENV === 'production' ? '; Secure' : ''),
  );
}
