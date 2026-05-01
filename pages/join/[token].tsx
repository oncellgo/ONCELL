import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import TopNav from '../../components/TopNav';
import { useIsMobile } from '../../lib/useIsMobile';

type CellInfo = {
  id: string;
  name: string;
  description: string | null;
  invite_message: string | null;
  enabled_modes: { qt?: boolean; reading?: boolean; memorize?: boolean; prayer?: boolean };
  member_count: number;
  approval_mode: 'auto' | 'manual';
  community_id: string | null;
};

type Props = {
  profileId: string | null;
  nickname: string | null;
  email: string | null;
};

const MODE_LABELS: Record<string, string> = { qt: '📖 큐티', reading: '📜 통독', memorize: '✨ 암송', prayer: '🙏 기도' };

export default function JoinPage({ profileId: ssrProfileId, nickname: ssrNickname, email: ssrEmail }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [profileId, setProfileId] = useState<string | null>(ssrProfileId);
  const [nickname, setNickname] = useState<string | null>(ssrNickname);
  const [email, setEmail] = useState<string | null>(ssrEmail);
  useEffect(() => {
    if (profileId) return;
    try {
      const pid = window.localStorage.getItem('kcisProfileId');
      const nick = window.localStorage.getItem('kcisNickname');
      const em = window.localStorage.getItem('kcisEmail');
      if (pid) setProfileId(pid);
      if (nick) setNickname(nick);
      if (em) setEmail(em);
    } catch {}
  }, [profileId]);

  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [cell, setCell] = useState<CellInfo | null>(null);
  const [community, setCommunity] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [agreeCommunity, setAgreeCommunity] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`/api/cells/join/${encodeURIComponent(token)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.errorReason || d.error || `${r.status}`);
        setCell(d.cell);
        setCommunity(d.community);
        setAgreeCommunity(false);
      } catch (e: any) {
        setErr(e?.message || '초대 정보를 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const join = async () => {
    if (!cell) return;
    if (!profileId) {
      // SSO 로그인 후 이 URL로 돌아오게
      const ret = encodeURIComponent(`/join/${token}`);
      window.location.href = `/auth/login?return=${ret}`;
      return;
    }
    if (cell.community_id && !agreeCommunity) {
      setErr('공동체 가입 동의가 필요합니다');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/cells/join/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId, joinCommunity: agreeCommunity }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.errorReason || d.error || `${r.status}`);
      if (d.alreadyMember) {
        router.replace(`/cells/${d.cell.id}`);
        return;
      }
      if (d.status === 'pending') {
        // 승인 대기
        setErr(null);
        alert('가입 신청 완료. owner 승인 후 입장 가능합니다.');
        router.replace('/cells');
      } else {
        router.replace(`/cells/${d.cell.id}`);
      }
    } catch (e: any) {
      setErr(e?.message || '가입 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head><title>{cell?.name ? `${cell.name} 초대 · ONCELL` : '초대 · ONCELL'}</title></Head>
      <div style={{ minHeight: '100vh' }}>
        <TopNav profileId={profileId} displayName={null} nickname={nickname} email={email} />
        <main style={{ maxWidth: 480, margin: '0 auto', padding: isMobile ? '1.25rem 1rem 4rem' : '2.5rem 1.5rem 5rem', color: '#fff' }}>

          {loading && <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '2rem 0' }}>초대 정보 확인 중…</div>}

          {err && !cell && (
            <div style={{ padding: '1.5rem', borderRadius: 16, background: '#fff', textAlign: 'center', color: '#182527' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠</div>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>초대를 확인할 수 없어요</div>
              <div style={{ fontSize: '0.88rem', color: '#475569' }}>{err}</div>
              <a href="/" style={{ display: 'inline-block', marginTop: '1rem', padding: '0.6rem 1.2rem', borderRadius: 10, background: '#A5F3FC', color: '#2D3850', fontWeight: 700, textDecoration: 'none' }}>홈으로</a>
            </div>
          )}

          {cell && (
            <div style={{ padding: '1.5rem', borderRadius: 16, background: '#fff', color: '#182527', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
              <div style={{ fontSize: '0.78rem', color: '#0891B2', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '0.4rem' }}>셀 초대</div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.6rem' }}>{cell.name}</h1>

              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {Object.entries(cell.enabled_modes || {}).filter(([, v]) => v).map(([k]) => (
                  <span key={k} style={{ fontSize: '0.7rem', padding: '0.2rem 0.55rem', borderRadius: 999, background: 'rgba(8,145,178,0.1)', color: '#0891B2', fontWeight: 600 }}>{MODE_LABELS[k] || k}</span>
                ))}
                <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.55rem', borderRadius: 999, background: 'rgba(0,0,0,0.06)', color: '#64748B' }}>멤버 {cell.member_count}명</span>
              </div>

              {cell.invite_message && (
                <p style={{ fontSize: '0.92rem', color: '#334155', lineHeight: 1.65, marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  {cell.invite_message}
                </p>
              )}

              {cell.description && (
                <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.65, marginBottom: '1rem' }}>{cell.description}</p>
              )}

              {/* 공동체 동의 */}
              {community && (
                <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: 12, background: '#FFF7ED', border: '1px solid #FED7AA' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.4rem', color: '#9A3412' }}>
                    이 셀은 [{community.name}] 공동체 셀입니다
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#7C2D12', lineHeight: 1.6, marginBottom: '0.7rem' }}>
                    가입하면 [{community.name}] 공동체 멤버로도 등록됩니다. 공동체 일정·공지를 받게 됩니다.
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.88rem', color: '#9A3412', fontWeight: 600 }}>
                    <input type="checkbox" checked={agreeCommunity} onChange={(e) => setAgreeCommunity(e.target.checked)} style={{ width: 18, height: 18 }} />
                    공동체 가입에 동의합니다
                  </label>
                </div>
              )}

              {cell.approval_mode === 'manual' && (
                <div style={{ marginBottom: '1rem', padding: '0.7rem 0.85rem', borderRadius: 10, background: '#FEF3C7', color: '#78350F', fontSize: '0.82rem' }}>
                  ⓘ 수동승인 모드: 가입 신청 후 owner 승인이 필요합니다.
                </div>
              )}

              {err && (
                <div style={{ marginBottom: '1rem', padding: '0.7rem 0.85rem', borderRadius: 10, background: '#FEE2E2', color: '#991B1B', fontSize: '0.85rem' }}>{err}</div>
              )}

              <button
                onClick={join}
                disabled={submitting || (!!community && !agreeCommunity)}
                style={{
                  width: '100%', padding: '0.95rem', minHeight: 50, borderRadius: 12,
                  background: submitting || (!!community && !agreeCommunity) ? '#94A3B8' : '#2D3850',
                  color: '#fff', fontWeight: 700, fontSize: '0.98rem', border: 'none',
                  cursor: submitting || (!!community && !agreeCommunity) ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? '가입 중…' : profileId ? '가입하기' : '로그인 후 가입'}
              </button>

              <div style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '0.78rem', color: '#94A3B8' }}>
                <a href="/" style={{ color: '#64748B', textDecoration: 'underline' }}>취소하고 홈으로</a>
              </div>
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
  return { props: { profileId, nickname, email } };
};
