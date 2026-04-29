import Head from 'next/head';
import Link from 'next/link';

const BlockedPage = () => (
  <>
    <Head><title>ONCELL | 접속이 제한되었습니다</title></Head>
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: "var(--font-sans)" }}>
      <div style={{ width: '100%', maxWidth: 460, padding: '2rem 1.5rem', borderRadius: 16, background: '#fff', border: '1px solid #fca5a5', boxShadow: 'var(--shadow-card)', textAlign: 'center', display: 'grid', gap: '0.85rem' }}>
        <div style={{ fontSize: '2.8rem', lineHeight: 1 }}>🔒</div>
        <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#b91c1c', wordBreak: 'keep-all' }}>접속이 제한된 계정입니다</h1>
        <p style={{ margin: 0, color: 'var(--color-ink-2)', fontSize: '0.92rem', lineHeight: 1.7, wordBreak: 'keep-all' }}>
          이 계정은 관리자에 의해 접속이 제한되었습니다.<br />재가입 및 로그인이 불가능합니다.<br />문의사항은 관리자에게 연락해주세요.
        </p>
        <Link href="/" style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: '0.75rem 1rem', borderRadius: 10, background: 'var(--color-ink-2)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none' }}>홈으로</Link>
      </div>
    </main>
  </>
);

export default BlockedPage;
