import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import SubHeader from '../../components/SubHeader';
import ConfirmModal from '../../components/ConfirmModal';
import { getSystemAdminHref } from '../../lib/adminGuard';
import { useIsMobile } from '../../lib/useIsMobile';
import { useRequireLogin } from '../../lib/useRequireLogin';

type Reservation = {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  location?: string;
  venueId?: string;
  createdBy: string;
  seriesId?: string;
  dateKey?: string;
};

type Props = {
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return { mmdd: `${m}/${day}`, dow: labels[d.getDay()], hm: `${hh}:${mm}` };
};

const MyReservationsPage = ({ profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const isMobile = useIsMobile();
  useRequireLogin(profileId);
  const [effectiveProfileId, setEffectiveProfileId] = useState<string | null>(profileId);
  const [items, setItems] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editBusy, setEditBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Reservation | null>(null);

  const reload = async () => {
    if (!effectiveProfileId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/events?communityId=kcis&profileId=${encodeURIComponent(effectiveProfileId)}&type=reservation`);
      const d = await r.json();
      setItems((d?.events || []) as Reservation[]);
    } catch { /* noop */ } finally { setLoading(false); }
  };

  const beginEdit = (r: Reservation) => {
    setEditingId(r.id);
    setEditValue(r.description || r.title || '');
  };
  const cancelEdit = () => { setEditingId(null); setEditValue(''); };
  const submitEdit = async (r: Reservation) => {
    if (!effectiveProfileId) return;
    const next = editValue.trim();
    if (!next) return;
    setEditBusy(true);
    try {
      const seriesId = (r as any).seriesId || r.id;
      const occurrenceDate = (r as any).dateKey || r.startAt.slice(0, 10);
      const res = await fetch('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId,
          occurrenceDate,
          profileId: effectiveProfileId,
          fields: { title: next, description: next },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        alert(j?.error || '수정 실패');
        return;
      }
      cancelEdit();
      await reload();
    } finally {
      setEditBusy(false);
    }
  };

  const onDelete = (r: Reservation) => setConfirmTarget(r);
  const performDelete = async () => {
    if (!effectiveProfileId || !confirmTarget) return;
    const r = confirmTarget;
    setDeletingId(r.id);
    try {
      const seriesId = (r as any).seriesId || r.id;
      const qs = new URLSearchParams({ id: seriesId, profileId: effectiveProfileId, scope: 'all' });
      const res = await fetch(`/api/events?${qs.toString()}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        alert(j?.error || '삭제 실패');
        return;
      }
      setConfirmTarget(null);
      await reload();
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!effectiveProfileId) {
      try {
        const p = window.localStorage.getItem('kcisProfileId');
        if (p) setEffectiveProfileId(p);
      } catch {}
    }
  }, [effectiveProfileId]);

  useEffect(() => {
    void reload();
    // reload reads effectiveProfileId; deps 는 해당 id 만 필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveProfileId]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...(items || [])].sort((a, b) => a.startAt.localeCompare(b.startAt));
    return {
      upcoming: sorted.filter((x) => new Date(x.endAt).getTime() >= now),
      past: sorted.filter((x) => new Date(x.endAt).getTime() < now).reverse(),
    };
  }, [items]);

  return (
    <>
      <Head>
        <title>KCIS | 나의 장소예약</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader
        profileId={profileId}
        displayName={displayName}
        nickname={nickname}
        email={email}
        systemAdminHref={systemAdminHref}
      />

      <main style={{ maxWidth: 840, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: '1.25rem' }}>
        <section style={{ padding: isMobile ? '0.85rem' : '1.25rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-ink)' }}>나의 장소예약</h2>
            <Link
              href={`/reservations/grid${effectiveProfileId ? `?profileId=${encodeURIComponent(effectiveProfileId)}` : ''}`}
              style={{ padding: '0.5rem 1rem', borderRadius: 999, border: '1px solid var(--color-primary)', background: '#fff', color: 'var(--color-primary)', fontWeight: 800, fontSize: '0.86rem', textDecoration: 'none' }}
            >
              + 새 예약하기
            </Link>
          </div>

          {!effectiveProfileId ? (
            <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem' }}>로그인 후 이용해 주세요.</p>
          ) : loading ? (
            <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem' }}>불러오는 중…</p>
          ) : (
            <>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.92rem', color: '#3F6212', fontWeight: 800 }}>다가오는 예약 ({upcoming.length})</h3>
                {upcoming.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.88rem' }}>예정된 예약이 없습니다.</p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
                    {upcoming.map((r) => {
                      const s = fmtDateTime(r.startAt);
                      const e = fmtDateTime(r.endAt);
                      const isEditing = editingId === r.id;
                      const isDeleting = deletingId === r.id;
                      return (
                        <li
                          key={r.id + r.startAt}
                          style={{
                            padding: '0.85rem 1rem',
                            borderRadius: 12,
                            background: '#ECFCCB',
                            border: '1px solid #D9F09E',
                            display: 'grid',
                            gap: '0.35rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--color-ink)' }}>{s.mmdd} ({s.dow})</span>
                            <span style={{ fontSize: '0.92rem', color: 'var(--color-ink)', fontWeight: 700 }}>{s.hm}~{e.hm}</span>
                            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.3rem' }}>
                              {!isEditing && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => beginEdit(r)}
                                    disabled={isDeleting}
                                    style={{ padding: '0.25rem 0.6rem', minHeight: 32, borderRadius: 8, border: '1px solid #65A30D', background: '#fff', color: '#3F6212', fontSize: '0.78rem', fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer' }}
                                  >수정</button>
                                  <button
                                    type="button"
                                    onClick={() => onDelete(r)}
                                    disabled={isDeleting}
                                    style={{ padding: '0.25rem 0.6rem', minHeight: 32, borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: '0.78rem', fontWeight: 800, cursor: isDeleting ? 'not-allowed' : 'pointer' }}
                                  >{isDeleting ? '삭제중…' : '삭제'}</button>
                                </>
                              )}
                            </span>
                          </div>
                          {isEditing ? (
                            <div style={{ display: 'grid', gap: '0.4rem' }}>
                              <input
                                type="text"
                                value={editValue}
                                onChange={(ev) => setEditValue(ev.target.value)}
                                autoFocus
                                maxLength={80}
                                placeholder="예약 설명 (최대 80자)"
                                style={{ padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid var(--color-gray)', fontSize: '0.92rem', color: 'var(--color-ink)', background: '#fff' }}
                              />
                              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => submitEdit(r)}
                                  disabled={editBusy || !editValue.trim()}
                                  style={{ padding: '0.45rem 0.9rem', minHeight: 36, borderRadius: 8, border: 'none', background: editBusy || !editValue.trim() ? '#9CA3AF' : 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: editBusy || !editValue.trim() ? 'not-allowed' : 'pointer' }}
                                >{editBusy ? '저장중…' : '저장'}</button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={editBusy}
                                  style={{ padding: '0.45rem 0.9rem', minHeight: 36, borderRadius: 8, border: '1px solid var(--color-gray)', background: '#fff', color: 'var(--color-ink-2)', fontWeight: 700, fontSize: '0.82rem', cursor: editBusy ? 'not-allowed' : 'pointer' }}
                                >취소</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.9rem', color: 'var(--color-ink)' }}>{r.title}</div>
                          )}
                          {r.location && !isEditing && (
                            <div style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)' }}>📍 {r.location}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {past.length > 0 && (
                <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--color-ink-2)', fontWeight: 800 }}>지난 예약 ({past.length})</h3>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
                    {past.slice(0, 10).map((r) => {
                      const s = fmtDateTime(r.startAt);
                      const e = fmtDateTime(r.endAt);
                      return (
                        <li
                          key={r.id + r.startAt}
                          style={{
                            padding: '0.65rem 0.85rem',
                            borderRadius: 10,
                            background: '#F9FAFB',
                            border: '1px solid var(--color-gray)',
                            color: 'var(--color-ink-2)',
                            fontSize: isMobile ? '0.8rem' : '0.85rem',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.4rem',
                            alignItems: 'baseline',
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{s.mmdd} ({s.dow})</span>
                          <span>{s.hm}~{e.hm}</span>
                          <span>· {r.title}</span>
                          {r.location && <span>· {r.location}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <ConfirmModal
        open={!!confirmTarget}
        title="이 예약을 삭제하시겠어요?"
        details={confirmTarget ? [
          confirmTarget.title || confirmTarget.description || '(제목 없음)',
          `${confirmTarget.startAt.slice(0, 10)} ${confirmTarget.startAt.slice(11, 16)}~${confirmTarget.endAt.slice(11, 16)}`,
          confirmTarget.location || '',
        ].filter(Boolean) : []}
        warning="삭제 후에는 되돌릴 수 없습니다."
        confirmLabel="삭제"
        confirmTone="danger"
        busy={!!deletingId}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={performDelete}
      />
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const profileId = typeof ctx.query.profileId === 'string' ? ctx.query.profileId : null;
  const nickname = typeof ctx.query.nickname === 'string' ? ctx.query.nickname : null;
  const email = typeof ctx.query.email === 'string' ? ctx.query.email : null;
  const systemAdminHref = await getSystemAdminHref(profileId, { nickname, email });
  return {
    props: {
      profileId,
      displayName: nickname,
      nickname,
      email,
      systemAdminHref,
    },
  };
};

export default MyReservationsPage;
