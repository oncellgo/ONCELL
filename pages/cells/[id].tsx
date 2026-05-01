import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import TopNav from '../../components/TopNav';
import { useIsMobile } from '../../lib/useIsMobile';
import { getSystemAdminHref } from '../../lib/adminGuard';

type Cell = {
  id: string;
  name: string;
  owner_profile_id: string;
  community_id: string | null;
  approval_mode: 'auto' | 'manual';
  invite_token: string;
  enabled_modes: { qt?: boolean; reading?: boolean; memorize?: boolean };
  description: string | null;
  invite_message: string | null;
  member_count: number;
};

type Props = {
  profileId: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

export default function CellDetail({ profileId, nickname, email, systemAdminHref }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const cellId = typeof router.query.id === 'string' ? router.query.id : '';
  const [cell, setCell] = useState<Cell | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId || !cellId) return;
    (async () => {
      try {
        const r = await fetch(`/api/cells/${encodeURIComponent(cellId)}?profileId=${encodeURIComponent(profileId)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.errorReason || d.error || `${r.status}`);
        setCell(d.cell);
      } catch (e: any) {
        setErr(e?.message || '셀 정보를 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId, cellId]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };

  const inviteUrl = cell ? `${typeof window !== 'undefined' ? window.location.origin : 'https://oncell.org'}/join/${cell.invite_token}` : '';

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      showToast('초대 링크 복사됨');
    } catch {
      showToast('복사 실패');
    }
  };

  const shareUrl = async () => {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: `${cell?.name} 초대`, text: cell?.invite_message || `${cell?.name}에 초대합니다`, url: inviteUrl });
        return;
      } catch {}
    }
    copyUrl();
  };

  return (
    <>
      <Head><title>{cell?.name || '셀'} · ONCELL</title></Head>
      <div style={{ minHeight: '100vh' }}>
        <div style={{ padding: isMobile ? '0.5rem 0.5rem 0' : '0.75rem 0.75rem 0', maxWidth: 1040, margin: '0 auto' }}>
          <TopNav profileId={profileId} displayName={null} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        </div>
        <main style={{ maxWidth: 620, margin: '0 auto', padding: isMobile ? '1.5rem 1rem 4rem' : '3rem 1.5rem 5rem', color: '#fff' }}>

          <a href="/cells" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', minHeight: 36, borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)', fontSize: '0.82rem', textDecoration: 'none', marginBottom: '1.25rem', fontWeight: 600 }}>
            ← 내 셀
          </a>

          {loading && <div style={{ color: 'rgba(255,255,255,0.6)' }}>불러오는 중…</div>}
          {err && <div style={{ padding: '1rem', borderRadius: 12, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.32)', color: '#FCA5A5' }}>{err}</div>}

          {cell && (
            <>
              <h1 style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 800, margin: '0 0 0.5rem' }}>{cell.name}</h1>

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {cell.enabled_modes?.qt && <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: 999, background: 'rgba(165,243,252,0.15)', color: '#A5F3FC', fontWeight: 600 }}>큐티</span>}
                {cell.enabled_modes?.reading && <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: 999, background: 'rgba(167,139,250,0.15)', color: '#C4B5FD', fontWeight: 600 }}>통독</span>}
                {cell.enabled_modes?.memorize && <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: 999, background: 'rgba(252,211,77,0.15)', color: '#FCD34D', fontWeight: 600 }}>암송</span>}
                <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>멤버 {cell.member_count}명</span>
                {cell.owner_profile_id === profileId && <span style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>owner</span>}
              </div>

              {cell.description && (
                <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.92rem', lineHeight: 1.7, margin: '0 0 1.5rem' }}>{cell.description}</p>
              )}

              {/* 초대 카드 */}
              <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(165,243,252,0.08)', border: '1px solid rgba(165,243,252,0.32)', marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 700, color: '#A5F3FC', marginBottom: '0.5rem', fontSize: '0.9rem' }}>친구 초대</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', wordBreak: 'break-all', padding: '0.65rem 0.8rem', borderRadius: 8, background: 'rgba(0,0,0,0.2)', marginBottom: '0.75rem', fontFamily: 'monospace' }}>{inviteUrl}</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={copyUrl} style={{ flex: 1, padding: '0.7rem', minHeight: 44, borderRadius: 10, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>복사</button>
                  <button onClick={shareUrl} style={{ flex: 1, padding: '0.7rem', minHeight: 44, borderRadius: 10, background: '#A5F3FC', border: 'none', color: '#2D3850', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>공유</button>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.6rem', lineHeight: 1.5 }}>
                  이 링크로 초대받은 친구는 SSO 로그인 후 셀에 가입할 수 있어요.
                  {cell.approval_mode === 'manual' && ' (수동승인 모드: owner 승인 필요)'}
                </div>
              </div>

              {/* 모드별 컨텐츠 placeholder */}
              <div style={{ padding: '1.5rem', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.88rem' }}>
                모드별 콘텐츠 (오늘의 큐티·통독·암송)는 다음 단계에서 만나보실 수 있어요.
              </div>
            </>
          )}

          {toast && (
            <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '0.7rem 1.2rem', borderRadius: 999, background: '#fff', color: '#2D3850', fontSize: '0.88rem', fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 50 }}>
              {toast}
            </div>
          )}

        </main>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const profileId = typeof context.query.profileId === 'string' ? context.query.profileId : null;
  const nickname = typeof context.query.nickname === 'string' ? context.query.nickname : null;
  const email = typeof context.query.email === 'string' ? context.query.email : null;
  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  return { props: { profileId, nickname, email, systemAdminHref } };
};
