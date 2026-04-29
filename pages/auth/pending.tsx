import Head from 'next/head';
import Link from 'next/link';

const PendingPage = () => (
  <>
    <Head><title>ONCELL | 가입 승인 대기</title></Head>
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: "var(--font-sans)" }}>
      <div style={{ width: '100%', maxWidth: 460, padding: '2rem 1.5rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', boxShadow: 'var(--shadow-card)', textAlign: 'center', display: 'grid', gap: '0.85rem' }}>
        <div style={{ fontSize: '2.8rem', lineHeight: 1 }}>⏳</div>
        <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#3F6212', wordBreak: 'keep-all' }}>가입 승인 대기 중</h1>
        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem', lineHeight: 1.7, wordBreak: 'keep-all' }}>
          로그인이 확인되었으나, 관리자의 가입 승인이 필요합니다.<br />승인이 완료되면 다시 로그인해주세요.
        </p>
        <Link href="/" style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: '0.75rem 1rem', borderRadius: 10, background: 'var(--color-primary)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none' }}>홈으로</Link>
      </div>
    </main>
  </>
);

export default PendingPage;
