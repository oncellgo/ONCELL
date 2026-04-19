import { useEffect, useState } from 'react';
import { useIsMobile } from '../lib/useIsMobile';

type Props = {
  profileId: string;
  k: string;
};

const EtcSettings = ({ profileId, k }: Props) => {
  const isMobile = useIsMobile();
  const authQS = `profileId=${encodeURIComponent(profileId)}&k=${encodeURIComponent(k)}`;
  const authHeaders = { 'x-profile-id': profileId, 'x-admin-token': k };

  const [venueSlotMin, setVenueSlotMin] = useState<30 | 60>(30);
  const [signupApproval, setSignupApproval] = useState<'auto' | 'admin'>('auto');
  const [requireRealName, setRequireRealName] = useState(true);
  const [requireContact, setRequireContact] = useState(true);
  const [venueAvailableStart, setVenueAvailableStart] = useState<string>('06:00');
  const [venueAvailableEnd, setVenueAvailableEnd] = useState<string>('22:00');
  const [reservationLimitMode, setReservationLimitMode] = useState<'unlimited' | 'perUser'>('unlimited');
  const [reservationLimitPerUser, setReservationLimitPerUser] = useState<number>(3);
  const [eventCategories, setEventCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/event-categories')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.categories)) setEventCategories(d.categories); })
      .catch(() => {});
  }, []);

  const addEventCategory = async () => {
    const name = newCategoryInput.trim();
    if (!name) return;
    try {
      const r = await fetch('/api/event-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (r.ok && Array.isArray(d.categories)) {
        setEventCategories(d.categories);
        setNewCategoryInput('');
      } else if (d?.error) {
        alert(d.error);
      }
    } catch { alert('추가에 실패했습니다.'); }
  };

  const deleteEventCategory = async (name: string) => {
    if (!confirm(`"${name}" 구분을 삭제하시겠습니까?`)) return;
    try {
      const r = await fetch(`/api/event-categories?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
      const d = await r.json();
      if (r.ok && Array.isArray(d.categories)) setEventCategories(d.categories);
    } catch { alert('삭제에 실패했습니다.'); }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/settings`);
        if (res.ok) {
          const data = await res.json();
          const v = data?.settings?.venueSlotMin;
          if (v === 30 || v === 60) setVenueSlotMin(v);
          const s = data?.settings?.signupApproval;
          if (s === 'auto' || s === 'admin') setSignupApproval(s);
          const fields = data?.settings?.signupRequiredFields;
          if (Array.isArray(fields)) {
            setRequireRealName(fields.includes('realName'));
            setRequireContact(fields.includes('contact'));
          }
          if (typeof data?.settings?.venueAvailableStart === 'string') setVenueAvailableStart(data.settings.venueAvailableStart);
          if (typeof data?.settings?.venueAvailableEnd === 'string') setVenueAvailableEnd(data.settings.venueAvailableEnd);
          if (data?.settings?.reservationLimitMode === 'unlimited' || data?.settings?.reservationLimitMode === 'perUser') setReservationLimitMode(data.settings.reservationLimitMode);
          if (typeof data?.settings?.reservationLimitPerUser === 'number') setReservationLimitPerUser(data.settings.reservationLimitPerUser);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patch = async (body: Record<string, any>) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/settings?${authQS}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setMessage('저장되었습니다.');
        setTimeout(() => setMessage(null), 1500);
      } else {
        setMessage('저장 실패');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: isMobile ? '0.7rem' : '1rem' }}>
      <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--color-ink)' }}>기타설정</h2>
      {loading ? (
        <p style={{ margin: 0, color: 'var(--color-ink-2)' }}>불러오는 중...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gap: '0.85rem', padding: isMobile ? '0.7rem 0.75rem' : '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#3F6212' }}>장소예약 가능시간</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', marginTop: '0.2rem' }}>예약 그리드에 표시되는 전체 시간 범위</div>
              </div>
              <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                <select
                  value={venueAvailableStart}
                  disabled={saving}
                  onChange={async (e) => { setVenueAvailableStart(e.target.value); await patch({ venueAvailableStart: e.target.value }); }}
                  style={{ padding: '0.4rem 0.55rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)', background: '#fff' }}
                >
                  {Array.from({ length: 48 }, (_, i) => {
                    const h = Math.floor(i / 2); const m = i % 2 === 0 ? '00' : '30';
                    const v = `${String(h).padStart(2, '0')}:${m}`;
                    return <option key={v} value={v}>{v}</option>;
                  })}
                </select>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>부터</span>
                <select
                  value={venueAvailableEnd}
                  disabled={saving}
                  onChange={async (e) => { setVenueAvailableEnd(e.target.value); await patch({ venueAvailableEnd: e.target.value }); }}
                  style={{ padding: '0.4rem 0.55rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)', background: '#fff' }}
                >
                  {Array.from({ length: 48 }, (_, i) => {
                    const h = Math.floor(i / 2); const m = i % 2 === 0 ? '00' : '30';
                    const v = `${String(h).padStart(2, '0')}:${m}`;
                    return <option key={v} value={v}>{v}</option>;
                  })}
                </select>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>까지</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.85rem', padding: isMobile ? '0.7rem 0.75rem' : '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#3F6212' }}>장소예약 시간그리드 단위</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', marginTop: '0.2rem' }}>예약 그리드의 시간 슬롯 한 칸 길이</div>
              </div>
              <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                {[30, 60].map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={saving}
                    onClick={async () => { setVenueSlotMin(v as 30 | 60); await patch({ venueSlotMin: v }); }}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: 999,
                      border: '1px solid',
                      borderColor: venueSlotMin === v ? '#65A30D' : 'var(--color-gray)',
                      background: venueSlotMin === v ? '#65A30D' : '#fff',
                      color: venueSlotMin === v ? '#fff' : 'var(--color-ink-2)',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {v === 30 ? '30분' : '1시간'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.85rem', padding: isMobile ? '0.7rem 0.75rem' : '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#3F6212' }}>신규 사용자 가입 승인</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', marginTop: '0.2rem' }}>로그인 시 즉시 가입 처리 또는 관리자 승인 후 가입</div>
              </div>
              <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                {([
                  { value: 'auto', label: '로그인 즉시 가입' },
                  { value: 'admin', label: '승인 후 가입' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={saving}
                    onClick={async () => { setSignupApproval(opt.value); await patch({ signupApproval: opt.value }); }}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: 999,
                      border: '1px solid',
                      borderColor: signupApproval === opt.value ? '#65A30D' : 'var(--color-gray)',
                      background: signupApproval === opt.value ? '#65A30D' : '#fff',
                      color: signupApproval === opt.value ? '#fff' : 'var(--color-ink-2)',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.85rem', padding: isMobile ? '0.7rem 0.75rem' : '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#3F6212' }}>가입시 필수정보</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', marginTop: '0.2rem' }}>가입 시 사용자가 반드시 입력해야 하는 항목 선택</div>
              </div>
              <div style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                {([
                  { key: 'realName', label: '실명', checked: requireRealName, setChecked: setRequireRealName },
                  { key: 'contact', label: '연락처', checked: requireContact, setChecked: setRequireContact },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      const nextRealName = opt.key === 'realName' ? !opt.checked : requireRealName;
                      const nextContact = opt.key === 'contact' ? !opt.checked : requireContact;
                      opt.setChecked(!opt.checked);
                      const fields: Array<'realName' | 'contact'> = [];
                      if (nextRealName) fields.push('realName');
                      if (nextContact) fields.push('contact');
                      await patch({ signupRequiredFields: fields });
                    }}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: 999,
                      border: '1px solid',
                      borderColor: opt.checked ? '#65A30D' : 'var(--color-gray)',
                      background: opt.checked ? '#65A30D' : '#fff',
                      color: opt.checked ? '#fff' : 'var(--color-ink-2)',
                      fontSize: '0.88rem',
                      fontWeight: 800,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span style={{ fontSize: '0.95rem' }}>{opt.checked ? '☑' : '☐'}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.85rem', padding: isMobile ? '0.7rem 0.75rem' : '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#3F6212' }}>한 user당 예약제한</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', marginTop: '0.2rem' }}>
                  무제한: 블럭되지 않고 시간·장소가 겹치지 않으면 여러 건 가능 / 인당 N건: 현재일자 이후 일정만 집계
                </div>
              </div>
              <div style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => { setReservationLimitMode('unlimited'); await patch({ reservationLimitMode: 'unlimited' }); }}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: 999,
                    border: '1px solid',
                    borderColor: reservationLimitMode === 'unlimited' ? '#65A30D' : 'var(--color-gray)',
                    background: reservationLimitMode === 'unlimited' ? '#65A30D' : '#fff',
                    color: reservationLimitMode === 'unlimited' ? '#fff' : 'var(--color-ink-2)',
                    fontSize: '0.88rem', fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >무제한</button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => { setReservationLimitMode('perUser'); await patch({ reservationLimitMode: 'perUser', reservationLimitPerUser }); }}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: 999,
                    border: '1px solid',
                    borderColor: reservationLimitMode === 'perUser' ? '#65A30D' : 'var(--color-gray)',
                    background: reservationLimitMode === 'perUser' ? '#65A30D' : '#fff',
                    color: reservationLimitMode === 'perUser' ? '#fff' : 'var(--color-ink-2)',
                    fontSize: '0.88rem', fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >인당</button>
                {reservationLimitMode === 'perUser' && (
                  <>
                    <select
                      value={reservationLimitPerUser}
                      disabled={saving}
                      onChange={async (e) => {
                        const n = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                        setReservationLimitPerUser(n);
                        await patch({ reservationLimitMode: 'perUser', reservationLimitPerUser: n });
                      }}
                      style={{ padding: '0.4rem 0.55rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-ink)', background: '#fff' }}
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <span style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', fontWeight: 700 }}>건</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem', padding: isMobile ? '0.7rem 0.75rem' : '0.85rem 1rem', borderRadius: 12, background: '#F7FEE7', border: '1px solid #D9F09E' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#3F6212' }}>일정 구분 관리</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', marginTop: '0.2rem' }}>일정 등록 시 선택할 수 있는 구분 목록</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {eventCategories.length === 0 ? (
                <span style={{ fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>등록된 구분이 없습니다.</span>
              ) : eventCategories.map((c) => {
                const locked = ['일반예배', '특별예배', '기도회', '특별기도회'].includes(c);
                return (
                  <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', borderRadius: 999, background: locked ? '#ECFCCB' : '#fff', border: '1px solid #D9F09E', fontSize: '0.85rem', color: '#3F6212', fontWeight: 700 }}>
                    {c}
                    {locked ? (
                      <span title="기본 구분 (삭제 불가)" style={{ fontSize: '0.78rem', color: '#65A30D' }}>🔒</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => deleteEventCategory(c)}
                        aria-label={`${c} 삭제`}
                        style={{ border: 'none', background: 'transparent', color: '#DC2626', fontSize: '0.9rem', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                      >✕</button>
                    )}
                  </span>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEventCategory(); } }}
                placeholder="새 구분 (예: 수련회, 생일, 기념행사)"
                style={{ flex: '1 1 220px', padding: '0.55rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-gray)', fontSize: '0.88rem' }}
              />
              <button
                type="button"
                onClick={addEventCategory}
                disabled={!newCategoryInput.trim()}
                style={{
                  padding: '0.55rem 1.1rem', borderRadius: 10, border: 'none',
                  background: newCategoryInput.trim() ? '#65A30D' : '#CBD5E1',
                  color: '#fff', fontWeight: 800, fontSize: '0.86rem',
                  cursor: newCategoryInput.trim() ? 'pointer' : 'not-allowed',
                }}
              >+ 추가</button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem', padding: isMobile ? '0.7rem 0.75rem' : '0.85rem 1rem', borderRadius: 12, background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#991B1B' }}>관리자 토큰 재설정</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-ink-2)', marginTop: '0.2rem' }}>
                토큰 노출이 의심될 때 새 토큰으로 즉시 교체합니다. 모든 관리자 페이지 접속 URL이 갱신됩니다.
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!confirm('관리자 토큰을 새로 발급할까요?\n현재 토큰은 즉시 무효화되며, 다른 관리자가 보고 있는 화면도 다시 로그인해야 할 수 있습니다.')) return;
                try {
                  const r = await fetch(`/api/admin/rotate-token?${authQS}`, {
                    method: 'POST',
                    headers: authHeaders,
                  });
                  const d = await r.json();
                  if (!r.ok || !d.token) {
                    alert(d.error || '토큰 재설정 실패');
                    return;
                  }
                  alert(`새 토큰이 발급되었습니다.\n\n${d.token}\n\n⚠️ 안전한 곳에 백업하세요. 페이지 URL이 자동으로 새 토큰으로 갱신됩니다.`);
                  // URL의 k 파라미터를 새 토큰으로 교체
                  const url = new URL(window.location.href);
                  url.searchParams.set('k', d.token);
                  window.history.replaceState(null, '', url.toString());
                  // 페이지 새로고침하여 새 토큰으로 다시 SSR
                  window.location.reload();
                } catch {
                  alert('토큰 재설정 중 오류가 발생했습니다.');
                }
              }}
              style={{
                alignSelf: 'flex-start',
                padding: '0.55rem 1.1rem', borderRadius: 10, border: 'none',
                background: '#DC2626', color: '#fff', fontWeight: 800, fontSize: '0.86rem',
                cursor: 'pointer',
              }}
            >🔑 토큰 재설정</button>
          </div>

          {message && <p style={{ margin: 0, fontSize: '0.8rem', color: '#4D7C0F', fontWeight: 700 }}>{message}</p>}
        </>
      )}
    </section>
  );
};

export default EtcSettings;
