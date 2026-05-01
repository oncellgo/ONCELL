import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import TopNav from '../../components/TopNav';
import { useIsMobile } from '../../lib/useIsMobile';
import { getSystemAdminHref } from '../../lib/adminGuard';

type Props = {
  profileId: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.85rem 0.95rem', minHeight: 48,
  borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.06)', color: '#fff',
  fontSize: '0.95rem', fontFamily: 'inherit', boxSizing: 'border-box',
};

export default function NewCell({ profileId: ssrProfileId, nickname: ssrNickname, email: ssrEmail, systemAdminHref }: Props) {
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabledModes, setEnabledModes] = useState({ qt: true, reading: false, memorize: false, prayer: false });
  const [qtSource, setQtSource] = useState<'maeil' | 'lifesoul' | 'qtin' | 'odb' | 'custom'>('maeil');
  const [customRangeUnit, setCustomRangeUnit] = useState<'week' | 'month' | 'year'>('month');
  const [approvalMode, setApprovalMode] = useState<'auto' | 'manual'>('auto');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleMode = (k: keyof typeof enabledModes) => setEnabledModes((p) => ({ ...p, [k]: !p[k] }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!profileId) { setErr('로그인 후 이용해주세요'); return; }
    if (!name.trim()) { setErr('셀 이름을 입력해주세요'); return; }
    if (!enabledModes.qt && !enabledModes.reading && !enabledModes.memorize && !enabledModes.prayer) { setErr('최소 한 가지 모드를 선택해주세요'); return; }

    setSubmitting(true);
    try {
      const communityId = typeof router.query.community === 'string' ? router.query.community : undefined;
      const qtSettings = enabledModes.qt ? {
        source: qtSource,
        ...(qtSource === 'custom' ? { customRangeUnit } : {}),
        showMeditationPoints: true,
        showApplicationQuestions: true,
      } : undefined;
      const r = await fetch('/api/cells', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId, name, description, enabledModes, approvalMode, communityId, qtSettings }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.errorReason || d.error || `${r.status}`);
      router.push(`/cells/${d.cell.id}`);
    } catch (e: any) {
      setErr(e?.message || '셀 만들기 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head><title>셀 만들기 · ONCELL</title></Head>
      <div style={{ minHeight: '100vh' }}>
          <TopNav profileId={profileId} displayName={null} nickname={nickname} email={email} systemAdminHref={systemAdminHref || undefined} />
        <main style={{ maxWidth: 560, margin: '0 auto', padding: isMobile ? '1.5rem 1rem 4rem' : '3rem 1.5rem 5rem', color: '#fff' }}>

          <a href="/cells" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', minHeight: 36, borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.78)', fontSize: '0.82rem', textDecoration: 'none', marginBottom: '1.25rem', fontWeight: 600 }}>
            ← 내 셀
          </a>

          <h1 style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 800, margin: '0 0 0.5rem' }}>새 셀 만들기</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.92rem', lineHeight: 1.65, margin: '0 0 2rem' }}>
            친구 3-5명과 매일 5분 영적 동행을 시작하세요.
          </p>

          {typeof router.query.community === 'string' && (
            <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', borderRadius: 12, background: '#FFF7ED', border: '1px solid #FED7AA', color: '#9A3412', fontSize: '0.88rem', fontWeight: 600 }}>
              ✓ 이 셀은 [{router.query.community}] 공동체 산하 셀로 만들어집니다
            </div>
          )}

          <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>

            <label style={{ display: 'grid', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>셀 이름 <span style={{ color: '#FCA5A5' }}>*</span></span>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 출근길 큐티 모임" style={inputStyle} maxLength={80} />
            </label>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>활성 모드 <span style={{ color: '#FCA5A5' }}>*</span></span>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {([
                  { k: 'qt', label: '📖 큐티 (매일 본문 + 묵상)' },
                  { k: 'reading', label: '📜 성경통독 (연간 계획)' },
                  { k: 'memorize', label: '✨ 암송 (구절 외우기)' },
                  { k: 'prayer', label: '🙏 기도 나눔 (셀 안에서만)' },
                ] as const).map(({ k, label }) => (
                  <label key={k} style={{ padding: '0.85rem 1rem', borderRadius: 12, background: enabledModes[k] ? 'rgba(165,243,252,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${enabledModes[k] ? 'rgba(165,243,252,0.4)' : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={enabledModes[k]} onChange={() => toggleMode(k)} style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: '0.92rem' }}>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 큐티 source 선택 (큐티 모드 활성 시만) */}
            {enabledModes.qt && (
              <div style={{ display: 'grid', gap: '0.5rem', padding: '0.85rem', borderRadius: 12, background: 'rgba(165,243,252,0.06)', border: '1px solid rgba(165,243,252,0.25)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>📖 큐티 본문 출처</span>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {([
                    { v: 'maeil',    l: '매일성경',         ready: true },
                    { v: 'lifesoul', l: '생명의 양식',      ready: false },
                    { v: 'qtin',     l: '큐티인 (QTin)',    ready: false },
                    { v: 'odb',      l: 'Our Daily Bread', ready: false },
                    { v: 'custom',   l: '직접 입력',        ready: true },
                  ] as const).map(({ v, l, ready }) => (
                    <label key={v} style={{ padding: '0.65rem 0.85rem', borderRadius: 10, background: qtSource === v ? 'rgba(165,243,252,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${qtSource === v ? 'rgba(165,243,252,0.45)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', fontSize: '0.88rem' }}>
                      <input type="radio" name="qtSource" checked={qtSource === v} onChange={() => setQtSource(v)} style={{ width: 16, height: 16 }} />
                      <span style={{ flex: 1 }}>{l}</span>
                      {!ready && <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: 999, background: 'rgba(252,211,77,0.15)', color: '#FCD34D', fontWeight: 600 }}>준비 중</span>}
                    </label>
                  ))}
                </div>
                {qtSource === 'custom' && (
                  <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.3rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>입력 단위</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {([{ v: 'week', l: '1주' }, { v: 'month', l: '1달' }, { v: 'year', l: '1년' }] as const).map(({ v, l }) => (
                        <label key={v} style={{ flex: 1, padding: '0.55rem', textAlign: 'center', borderRadius: 8, background: customRangeUnit === v ? 'rgba(165,243,252,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${customRangeUnit === v ? 'rgba(165,243,252,0.45)' : 'rgba(255,255,255,0.1)'}`, fontSize: '0.82rem', cursor: 'pointer' }}>
                          <input type="radio" name="customUnit" checked={customRangeUnit === v} onChange={() => setCustomRangeUnit(v)} style={{ display: 'none' }} />
                          {l}
                        </label>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
                      ※ 셀 만든 후 셀 메인의 큐티 탭에서 본문을 입력할 수 있어요
                    </span>
                  </div>
                )}
              </div>
            )}

            <label style={{ display: 'grid', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>셀 소개 (선택)</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="이 셀이 어떤 모임인지 짧게" rows={3} style={{ ...inputStyle, resize: 'vertical' }} maxLength={1000} />
            </label>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>가입 승인 방식</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {([{ v: 'auto', l: '자동승인' }, { v: 'manual', l: '수동승인' }] as const).map(({ v, l }) => (
                  <label key={v} style={{ flex: 1, padding: '0.7rem', textAlign: 'center', borderRadius: 12, background: approvalMode === v ? 'rgba(165,243,252,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${approvalMode === v ? 'rgba(165,243,252,0.4)' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', fontSize: '0.88rem' }}>
                    <input type="radio" name="approval" checked={approvalMode === v} onChange={() => setApprovalMode(v)} style={{ display: 'none' }} />
                    {l}
                  </label>
                ))}
              </div>
            </div>

            {err && <div style={{ padding: '0.7rem 0.85rem', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.32)', color: '#FCA5A5', fontSize: '0.88rem' }}>{err}</div>}

            <button type="submit" disabled={submitting} style={{ padding: '0.95rem', minHeight: 50, borderRadius: 12, background: submitting ? 'rgba(255,255,255,0.5)' : '#fff', color: '#2D3850', fontWeight: 800, fontSize: '0.98rem', border: 'none', cursor: submitting ? 'wait' : 'pointer' }}>
              {submitting ? '만드는 중…' : '셀 만들기'}
            </button>

          </form>
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
