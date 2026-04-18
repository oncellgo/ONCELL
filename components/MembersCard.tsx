import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

type Approval = {
  profileId: string;
  provider: string;
  nickname: string;
  email: string;
  realName?: string;
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

const providerBadge = (p: string) => {
  const label = p === 'kakao' ? 'Kakao' : p === 'google' ? 'Google' : p;
  const bg = p === 'kakao' ? '#FEE500' : p === 'google' ? '#fff' : '#E5E7EB';
  const color = p === 'kakao' ? '#181600' : p === 'google' ? '#1F2937' : '#374151';
  const border = p === 'google' ? '1px solid #D1D5DB' : 'none';
  return (
    <span style={{ display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: 999, background: bg, color, fontSize: '0.7rem', fontWeight: 700, border, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
};

const MembersCard = ({ profileId, k }: Props) => {
  const isMobile = useIsMobile();
  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}`;
  const authHeaders = { 'x-profile-id': profileId, 'x-admin-token': k };

  const [members, setMembers] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.85rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-ink)' }}>가입현황 ({members.length})</h2>
      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : members.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>승인된 교인이 없습니다.</p>
      ) : (
        <div className="responsive-x-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '0.78rem' : '0.86rem', minWidth: isMobile ? 560 : 'auto' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', color: 'var(--color-ink-2)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap', width: 40 }}>#</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>실명</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>아이디</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>제공자</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>이메일</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>가입일</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>최근접속</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.profileId} style={{ borderTop: '1px solid var(--color-surface-border)' }}>
                  <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink-2)' }}>{i + 1}</td>
                  <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: 'var(--color-ink)' }}>{m.realName || '-'}</td>
                  <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink)' }}>{m.nickname || m.email?.split('@')[0] || m.profileId}</td>
                  <td style={{ padding: '0.55rem 0.6rem' }}>{providerBadge(m.provider)}</td>
                  <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{m.email || '-'}</td>
                  <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{formatDate(m.firstLoginAt)}</td>
                  <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>{formatDate(m.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default MembersCard;
