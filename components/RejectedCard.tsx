import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';
import { providerIdPill } from './providerPill';

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
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
};

const RejectedCard = ({ profileId, k }: Props) => {
  const isMobile = useIsMobile();
  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}`;
  const authHeaders = { 'x-profile-id': profileId, 'x-admin-token': k };

  const [rejected, setRejected] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/signup-approvals?${authQS}&status=rejected`, { headers: authHeaders });
      if (res.ok) {
        const d = await res.json();
        setRejected(d.approvals || []);
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected((prev) => prev.size === rejected.length ? new Set() : new Set(rejected.map((a) => a.profileId)));

  const act = async (action: 'approve' | 'delete') => {
    if (selected.size === 0) return;
    const label = action === 'approve' ? '재승인' : '삭제';
    if (!confirm(`선택된 ${selected.size}명을 ${label}하시겠습니까?`)) return;
    setBusy(true);
    try {
      if (action === 'approve') {
        await fetch(`/api/admin/signup-approvals?${authQS}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ profileIds: Array.from(selected), action: 'approve' }),
        });
      } else {
        await fetch(`/api/admin/signup-approvals?${authQS}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ profileIds: Array.from(selected) }),
        });
      }
      setSelected(new Set());
      await load();
    } finally { setBusy(false); }
  };

  return (
    <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.85rem' }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', gap: '0.6rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-ink)' }}>가입 거부 ({rejected.length})</h2>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => act('approve')}
            style={{
              flex: 1,
              minHeight: 40,
              padding: '0 0.9rem',
              borderRadius: 8, border: 'none',
              background: selected.size === 0 ? '#E5E7EB' : '#65A30D',
              color: selected.size === 0 ? '#9CA3AF' : '#fff',
              fontWeight: 800, fontSize: '0.85rem',
              cursor: selected.size === 0 || busy ? 'not-allowed' : 'pointer',
            }}
          >재승인 ({selected.size})</button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => act('delete')}
            style={{
              flex: 1,
              minHeight: 40,
              padding: '0 0.9rem',
              borderRadius: 8, border: 'none',
              background: selected.size === 0 ? '#E5E7EB' : '#b91c1c',
              color: selected.size === 0 ? '#9CA3AF' : '#fff',
              fontWeight: 800, fontSize: '0.85rem',
              cursor: selected.size === 0 || busy ? 'not-allowed' : 'pointer',
            }}
          >삭제 ({selected.size})</button>
        </div>
      </div>
      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : rejected.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>거부된 접속자가 없습니다.</p>
      ) : (
        <div className="responsive-x-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '0.78rem' : '0.86rem', minWidth: isMobile ? 640 : 'auto' }}>
            <thead>
              <tr style={{ background: '#FEE2E2', color: '#991B1B', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.6rem', width: 40 }}>
                  <input type="checkbox" aria-label="전체 선택" checked={selected.size === rejected.length && rejected.length > 0} onChange={toggleAll} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>최초접속일</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>아이디</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>실명</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>이메일</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>연락처</th>
                <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>로그인 횟수</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>최근접속일</th>
              </tr>
            </thead>
            <tbody>
              {rejected.map((a) => (
                <tr key={a.profileId} style={{ borderTop: '1px solid var(--color-surface-border)', background: selected.has(a.profileId) ? '#FEF2F2' : '#fff' }}>
                  <td style={{ padding: '0.55rem 0.6rem' }}>
                    <input type="checkbox" aria-label={`${a.realName || a.nickname || a.profileId} 선택`} checked={selected.has(a.profileId)} onChange={() => toggle(a.profileId)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  </td>
                  <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--color-ink-2)' }}>{formatDate(a.firstLoginAt)}</td>
                  <td style={{ padding: '0.55rem 0.6rem' }}>{providerIdPill(a.provider, a.nickname || a.email?.split('@')[0] || a.profileId)}</td>
                  <td style={{ padding: '0.55rem 0.6rem', color: 'var(--color-ink)' }}>{a.realName || '-'}</td>
                  <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--color-ink-2)' }}>{a.email || '-'}</td>
                  <td style={{ padding: '0.55rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--color-ink-2)', fontFamily: 'var(--font-mono, monospace)' }}>{a.contact || '-'}</td>
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

export default RejectedCard;
