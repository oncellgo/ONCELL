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
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
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

const SignupApprovalsCard = ({ profileId, k }: Props) => {
  const isMobile = useIsMobile();
  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}`;
  const authHeaders = { 'x-profile-id': profileId, 'x-admin-token': k };

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/signup-approvals?${authQS}&status=pending`, { headers: authHeaders });
      if (res.ok) {
        const d = await res.json();
        setApprovals(d.approvals || []);
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((prev) => prev.size === approvals.length ? new Set() : new Set(approvals.map((a) => a.profileId)));

  const act = async (action: 'approve' | 'reject') => {
    if (selected.size === 0) return;
    const label = action === 'approve' ? '승인' : '거부';
    if (!confirm(`선택된 ${selected.size}명을 일괄 ${label}하시겠습니까?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/signup-approvals?${authQS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ profileIds: Array.from(selected), action }),
      });
      if (res.ok) { setSelected(new Set()); await load(); }
    } finally { setBusy(false); }
  };

  return (
    <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-ink)' }}>가입처리할 접속자 ({approvals.length})</h2>
        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
          <button type="button" disabled={busy || selected.size === 0} onClick={() => act('approve')} style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: selected.size === 0 ? '#E5E7EB' : '#65A30D', color: selected.size === 0 ? '#9CA3AF' : '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: selected.size === 0 || busy ? 'not-allowed' : 'pointer' }}>가입 승인 ({selected.size})</button>
          <button type="button" disabled={busy || selected.size === 0} onClick={() => act('reject')} style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: selected.size === 0 ? '#E5E7EB' : '#b91c1c', color: selected.size === 0 ? '#9CA3AF' : '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: selected.size === 0 || busy ? 'not-allowed' : 'pointer' }}>가입 거부 ({selected.size})</button>
        </div>
      </div>
      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : approvals.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>승인 대기 중인 접속자가 없습니다.</p>
      ) : (
        <div className="responsive-x-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '0.78rem' : '0.86rem', minWidth: isMobile ? 600 : 'auto' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', color: 'var(--color-ink-2)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.6rem', width: 32 }}>
                  <input type="checkbox" checked={selected.size === approvals.length && approvals.length > 0} onChange={toggleAll} />
                </th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>최초접속일</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>아이디</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>제공자</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>실명</th>
                <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>로그인 횟수</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>최근접속일</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.profileId} style={{ borderTop: '1px solid var(--color-surface-border)', background: selected.has(a.profileId) ? '#F7FEE7' : '#fff' }}>
                  <td style={{ padding: '0.55rem 0.6rem' }}>
                    <input type="checkbox" checked={selected.has(a.profileId)} onChange={() => toggle(a.profileId)} />
                  </td>
                  <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--color-ink-2)' }}>{formatDate(a.firstLoginAt)}</td>
                  <td style={{ padding: '0.55rem 0.6rem', fontWeight: 700, color: 'var(--color-ink)' }}>{a.nickname || a.email?.split('@')[0] || a.profileId}</td>
                  <td style={{ padding: '0.55rem 0.6rem' }}>{providerBadge(a.provider)}</td>
                  <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink)' }}>{a.realName || '-'}</td>
                  <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', color: 'var(--color-ink-2)' }}>{a.loginCount}</td>
                  <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--color-ink-2)' }}>{formatDate(a.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default SignupApprovalsCard;
