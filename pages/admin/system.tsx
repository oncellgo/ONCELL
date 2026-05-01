import { GetServerSideProps } from 'next';
import Head from 'next/head';
import TopNav from '../../components/TopNav';
import { requireSystemAdminSSR } from '../../lib/adminGuard';
import { useIsMobile } from '../../lib/useIsMobile';

type Props = {
  profileId: string | null;
  email: string | null;
};

const SystemAdmin = ({ profileId, email }: Props) => {
  const isMobile = useIsMobile();

  return (
    <>
      <Head><title>시스템 관리자 · ONCELL</title></Head>

      <div style={{ minHeight: '100vh' }}>
        <div style={{ padding: isMobile ? '0.5rem 0.5rem 0' : '0.75rem 0.75rem 0', maxWidth: 1040, margin: '0 auto', width: '100%' }}>
          <TopNav profileId={profileId} displayName={null} nickname={null} email={email} />
        </div>

        <main style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? '1.5rem 1rem 4rem' : '3rem 1.5rem 5rem', color: '#fff' }}>
          <h1 style={{ fontSize: isMobile ? '1.5rem' : '1.85rem', fontWeight: 800, margin: '0 0 0.5rem' }}>시스템 관리</h1>
          <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.95rem', lineHeight: 1.7, margin: '0 0 2rem' }}>
            셀·공동체 시스템 구축 중입니다. 기존 KCIS 운영 화면(예약·주보·구역모임교안)은 정리되었습니다.
          </p>

          <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>다음 단계 (예정)</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'rgba(255,255,255,0.78)', fontSize: '0.9rem', lineHeight: 1.7 }}>
              <li>셀 한도 설정 (전역)</li>
              <li>공동체 생성·관리</li>
              <li>가입자 명단·운영 통계</li>
            </ul>
          </div>
        </main>
      </div>
    </>
  );
};

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const result = await requireSystemAdminSSR(context);
  if ('notFound' in result) return { notFound: true };
  const email = typeof context.query.email === 'string' ? context.query.email : null;
  return { props: { profileId: result.profileId, email } };
};

export default SystemAdmin;
