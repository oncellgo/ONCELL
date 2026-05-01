import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = new Set(['/', '/privacy', '/terms', '/feed-preview']);
const PUBLIC_PREFIXES: string[] = ['/cells', '/api/cells', '/join'];

export function proxy(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_BETA_GATE !== 'true') return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = '?beta=1';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/|images/|icons/|favicon|manifest.json|sw.js|robots.txt|apple-touch-icon).*)'],
};
