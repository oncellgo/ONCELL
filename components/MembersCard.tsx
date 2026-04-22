import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

type Approval = {
  profileId: string;
  provider: string;
  nickname: string;
  email: string;
  realName?: string;
  contact?: string;
  firstLoginAt: string;
  lastLoginAt: string;
  loginCount: number;
  status: 'pending' | 'approved' | 'rejected';
};

type Props = {
  profileId: string;
  k: string;
};

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  } catch { return iso; }
};

// 아이디 + 제공자 색상을 한 칩으로 표시
const providerIdPill = (provider: string, id: string) => {
  const bg = provider === 'kakao' ? '#FEE500' : provider === 'google' ? '#fff' : '#E5E7EB';
  const color = provider === 'kakao' ? '#181600' : provider === 'google' ? '#1F2937' : '#374151';
  const border = provider === 'google' ? '1px solid #D1D5DB' : '1px solid transparent';
  const prefix = provider === 'kakao' ? 'K' : provider === 'google' ? 'G' : provider.charAt(0).toUpperCase();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.15rem 0.55rem', borderRadius: 999, background: bg, color, fontSize: '0.76rem', fontWeight: 700, border, whiteSpace: 'nowrap', maxWidth: '100%' }}>
      <span style={{ width: 14, height: 14, borderRadius: 999, background: provider === 'kakao' ? '#181600' : provider === 'google' ? '#F3F4F6' : '#6B7280', color: provider === 'kakao' ? '#FEE500' : '#1F2937', fontSize: '0.62rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{prefix}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{id}</span>
    </span>
  );
};

const MembersCard = ({ profileId, k }: Props) => {
  const isMobile = useIsMobile();
  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}`;
  const authHeaders = { 'x-profile-id': profileId, 'x-admin-token': k };

  const [members, setMembers] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/signup-approvals?${authQS}&status=approved`, { headers: authHeaders });
      if (res.ok) {
        const d = await res.json();
        setMembers(d.approvals || []);
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const blockMember = async (m: Approval) => {
    const name = m.realName || m.nickname || m.profileId;
    if (!window.confirm(`${name} 님을 차단하시겠습니까?\n\n차단 후에는 같은 계정으로 다시 가입·로그인이 불가능합니다.\n본인이 아닌지 확인하세요.`)) return;
    setBusy(m.profileId);
    try {
      const res = await fetch(`/api/admin/signup-approvals?${authQS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ profileIds: [m.profileId], action: 'block' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || '차단 실패');
      }
      setMembers((prev) => prev.filter((x) => x.profileId !== m.profileId));
    } catch (e: any) {
      window.alert(e?.message || '차단 실패');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.85rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-ink)' }}>가입현황 ({members.length})</h2>
      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : members.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>승인된 교인이 없습니다.</p>
      ) : (
        <div className="responsive-x-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '0.78rem' : '0.86rem', minWidth: isMobile ? 520 : 'auto' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', color: 'var(--color-ink-2)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap', width: 40 }}>#</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>실명</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>아이디</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>연락처</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>가입일</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap', width: 72 }} aria-label="차단"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const isMe = m.profileId === profileId;
                return (
                  <tr key={m.profileId} style={{ borderTop: '1px solid var(--color-surface-border)' }}>
                    <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink-2)' }}>{i + 1}</td>
                    <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: 'var(--color-ink)' }}>{m.realName || '-'}</td>
                    <td style={{ padding: '0.55rem 0.6rem' }} title={m.email || '(이메일 없음)'}>
                      {providerIdPill(m.provider, m.nickname || m.email?.split('@')[0] || m.profileId)}
                    </td>
                    <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink-2)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>{m.contact || '-'}</td>
                    <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{formatDate(m.firstLoginAt)}</td>
                    <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        disabled={isMe || busy === m.profileId}
                        onClick={() => blockMember(m)}
                        title={isMe ? '본인 계정은 차단할 수 없습니다' : '이 사용자를 차단합니다'}
                        style={{
                          padding: '0.35rem 0.7rem', borderRadius: 8, border: 'none',
                          background: isMe ? '#E5E7EB' : '#B91C1C', color: isMe ? '#6B7280' : '#fff',
                          fontSize: '0.78rem', fontWeight: 700,
                          cursor: isMe ? 'not-allowed' : (busy === m.profileId ? 'wait' : 'pointer'),
                          opacity: busy === m.profileId ? 0.6 : 1, minHeight: 32,
                        }}
                      >{busy === m.profileId ? '...' : '차단'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default MembersCard;
