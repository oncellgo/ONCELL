import Head from 'next/head';
import Link from 'next/link';

const LoginPage = () => {
  return (
    <>
      <Head>
        <title>KCIS | 로그인</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'var(--font-sans)' }}>
        <div style={{ width: '100%', maxWidth: 420, padding: '2rem 1.75rem', borderRadius: 16, background: '#fff', border: '1px solid #D9F09E', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1.1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem' }}>🕊️</div>
            <h1 style={{ margin: '0.4rem 0 0', fontSize: '1.3rem', color: '#3F6212' }}>KCIS 로그인</h1>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.9rem' }}>싱가폴한인교회 · 로그인 방법을 선택하세요</p>
          </div>

          <a
            href="/api/auth/kakao"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.55rem',
              padding: '0.85rem 1rem',
              borderRadius: 12,
              background: '#FEE500',
              color: '#181600',
              fontWeight: 800,
              fontSize: '0.98rem',
              textDecoration: 'none',
              border: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3C6.48 3 2 6.58 2 11c0 2.78 1.77 5.23 4.5 6.65L5.5 21l3.85-2.12c.86.16 1.75.24 2.65.24 5.52 0 10-3.58 10-8S17.52 3 12 3z" fill="#181600"/>
            </svg>
            카카오 로그인
          </a>

          <a
            href="/api/auth/google"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.55rem',
              padding: '0.85rem 1rem',
              borderRadius: 12,
              background: '#ffffff',
              color: '#1F2937',
              fontWeight: 700,
              fontSize: '0.98rem',
              textDecoration: 'none',
              border: '1px solid #D1D5DB',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.9 6.1 29.2 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.8-2 13.3-5.2l-6.2-5.2c-2 1.4-4.5 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C41.3 35 44 29.9 44 24c0-1.2-.1-2.3-.4-3.5z"/>
            </svg>
            Google 로그인
          </a>

          <div style={{ textAlign: 'center', marginTop: '0.4rem' }}>
            <Link href="/" style={{ fontSize: '0.82rem', color: 'var(--color-ink-2)', textDecoration: 'none' }}>← 홈으로</Link>
          </div>
        </div>
      </main>
    </>
  );
};

export default LoginPage;
