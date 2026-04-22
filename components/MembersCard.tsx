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
  status: 'pending' | 'approved' | 'rejected' | 'blocked' | 'withdrawn';
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

type ConfirmKind = 'block' | 'delete';

const MembersCard = ({ profileId, k }: Props) => {
  const isMobile = useIsMobile();
  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}`;
  const authHeaders = { 'x-profile-id': profileId, 'x-admin-token': k };

  const [members, setMembers] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ kind: ConfirmKind; member: Approval } | null>(null);

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

  const doBlock = async (m: Approval) => {
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

  const doDelete = async (m: Approval) => {
    setBusy(m.profileId);
    try {
      // authQS 의 profileId(호출자 본인) 와 삭제 대상 profileId 가 같은 key 로 충돌하므로
      // URL 에는 토큰만, 인증은 헤더(x-profile-id/x-admin-token) 로.
      const res = await fetch(`/api/admin/delete-user?profileId=${encodeURIComponent(m.profileId)}&k=${encodeURIComponent(k)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || '정보 삭제 실패');
      }
      setMembers((prev) => prev.filter((x) => x.profileId !== m.profileId));
    } catch (e: any) {
      window.alert(e?.message || '정보 삭제 실패');
    } finally {
      setBusy(null);
    }
  };

  const confirmLabel = confirmTarget?.kind === 'block' ? '차단하기' : '정보 삭제';
  const confirmColor = confirmTarget?.kind === 'block' ? '#B91C1C' : '#7F1D1D';
  const targetName = confirmTarget?.member.realName || confirmTarget?.member.nickname || confirmTarget?.member.profileId || '';

  return (
    <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '0.85rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-ink)' }}>가입현황 ({members.length})</h2>
      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : members.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>승인된 교인이 없습니다.</p>
      ) : (
        <div className="responsive-x-scroll" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '0.78rem' : '0.86rem', minWidth: isMobile ? 600 : 'auto' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', color: 'var(--color-ink-2)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap', width: 40 }}>#</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>실명</th>
                <th style={{ padding: '0.5rem 0.6rem' }}>아이디</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>연락처</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap' }}>가입일</th>
                <th style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap', width: 150 }} aria-label="관리"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const isMe = m.profileId === profileId;
                const working = busy === m.profileId;
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
                      <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                        <button
                          type="button"
                          disabled={isMe || working}
                          onClick={() => setConfirmTarget({ kind: 'block', member: m })}
                          title={isMe ? '본인 계정은 차단할 수 없습니다' : '이 사용자를 차단합니다'}
                          style={{
                            padding: '0.35rem 0.7rem', borderRadius: 8, border: 'none',
                            background: isMe ? '#E5E7EB' : '#B91C1C', color: isMe ? '#6B7280' : '#fff',
                            fontSize: '0.78rem', fontWeight: 700,
                            cursor: isMe ? 'not-allowed' : (working ? 'wait' : 'pointer'),
                            opacity: working ? 0.6 : 1, minHeight: 32,
                          }}
                        >차단</button>
                        <button
                          type="button"
                          disabled={isMe || working}
                          onClick={() => setConfirmTarget({ kind: 'delete', member: m })}
                          title={isMe ? '본인 계정은 삭제할 수 없습니다' : '이 사용자의 가입·예약·기록을 완전 삭제합니다'}
                          style={{
                            padding: '0.35rem 0.7rem', borderRadius: 8, border: '1px solid ' + (isMe ? '#E5E7EB' : '#7F1D1D'),
                            background: isMe ? '#F9FAFB' : '#fff', color: isMe ? '#6B7280' : '#7F1D1D',
                            fontSize: '0.78rem', fontWeight: 800,
                            cursor: isMe ? 'not-allowed' : (working ? 'wait' : 'pointer'),
                            opacity: working ? 0.6 : 1, minHeight: 32,
                          }}
                        >정보 삭제</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 차단·삭제 공용 경고 확인 모달 */}
      {confirmTarget && (
        <div
          role="dialog"
          aria-label={confirmLabel + ' 확인'}
          onClick={(e) => { if (e.target === e.currentTarget && busy !== confirmTarget.member.profileId) setConfirmTarget(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', border: '2px solid ' + confirmColor, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.2rem', background: '#FEF2F2', borderBottom: '1px solid #FCA5A5', display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
              <span aria-hidden style={{ fontSize: '1.5rem', lineHeight: 1 }}>🚨</span>
              <div style={{ display: 'grid', gap: '0.15rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#7F1D1D' }}>
                  {confirmTarget.kind === 'block' ? `${targetName} 님을 차단하시겠습니까?` : `${targetName} 님의 가입 정보를 삭제하시겠습니까?`}
                </h3>
              </div>
            </div>

            <div style={{ padding: '0.95rem 1.2rem', fontSize: '0.88rem', color: '#4B5563', lineHeight: 1.65, display: 'grid', gap: '0.55rem' }}>
              {confirmTarget.kind === 'block' ? (
                <>
                  <p style={{ margin: 0 }}>
                    차단 후에는 이 계정(카카오/구글)으로 <strong style={{ color: '#B91C1C' }}>다시 가입·로그인이 불가능</strong>합니다.
                  </p>
                  <p style={{ margin: 0 }}>가입 정보·예약은 보존되며, 필요 시 관리자 기록 확인에 쓰입니다.</p>
                  <p style={{ margin: 0, color: '#B91C1C', fontWeight: 700 }}>본인이 아닌지, 실수 가입이 아닌지 한 번 더 확인해주세요.</p>
                </>
              ) : (
                <>
                  <p style={{ margin: 0 }}>아래 정보가 <strong style={{ color: '#B91C1C' }}>즉시 완전 삭제</strong>되며 <strong>복구가 불가능</strong>합니다.</p>
                  <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1.3rem', display: 'grid', gap: '0.2rem', color: '#7F1D1D', fontWeight: 600 }}>
                    <li>가입 정보(프로필·이름·연락처·이메일)</li>
                    <li>해당 사용자가 등록한 모든 장소 예약</li>
                    <li>로그인·승인 이력</li>
                  </ul>
                  <p style={{ margin: 0 }}>단순 차단과 달리 이력까지 모두 사라집니다. 차단이 필요하신 경우엔 '차단' 버튼을 사용하세요.</p>
                </>
              )}
            </div>

            <div style={{ padding: '0.85rem 1.2rem', borderTop: '1px solid var(--color-surface-border)', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={busy === confirmTarget.member.profileId}
                style={{ padding: '0.65rem 1.1rem', borderRadius: 10, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.9rem', minHeight: 44, cursor: 'pointer' }}
              >취소</button>
              <button
                type="button"
                disabled={busy === confirmTarget.member.profileId}
                onClick={async () => {
                  const m = confirmTarget.member;
                  const kind = confirmTarget.kind;
                  setConfirmTarget(null);
                  if (kind === 'block') await doBlock(m);
                  else await doDelete(m);
                }}
                style={{ padding: '0.65rem 1.1rem', borderRadius: 10, border: 'none', background: confirmColor, color: '#fff', fontWeight: 800, fontSize: '0.9rem', minHeight: 44, cursor: 'pointer' }}
              >{confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default MembersCard;
