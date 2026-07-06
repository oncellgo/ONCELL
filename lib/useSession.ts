import { useEffect, useState } from 'react';

/**
 * 클라이언트 신원 소스 — 세션 쿠키 기반(/api/auth/me).
 * Phase 3: URL 쿼리·localStorage 대신 이 훅으로 신원을 취득한다.
 */
export type SessionUser = {
  authenticated: boolean;
  profileId: string | null;
  nickname: string | null;
  email: string | null;
  realName: string | null;
  status: string | null;
  isSystemAdmin: boolean;
  systemAdminHref: string | null;
  loading: boolean;
};

const EMPTY: SessionUser = {
  authenticated: false, profileId: null, nickname: null, email: null,
  realName: null, status: null, isSystemAdmin: false, systemAdminHref: null, loading: true,
};

export const useSession = (): SessionUser => {
  const [s, setS] = useState<SessionUser>(EMPTY);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/auth/me');
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok && d.authenticated) {
          setS({
            authenticated: true,
            profileId: d.profileId || null,
            nickname: d.nickname || null,
            email: d.email || null,
            realName: d.realName || null,
            status: d.status || null,
            isSystemAdmin: !!d.isSystemAdmin,
            systemAdminHref: d.systemAdminHref || null,
            loading: false,
          });
        } else {
          setS({ ...EMPTY, loading: false });
        }
      } catch {
        if (alive) setS({ ...EMPTY, loading: false });
      }
    })();
    return () => { alive = false; };
  }, []);
  return s;
};
