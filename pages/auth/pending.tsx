import { GetServerSideProps } from 'next';

// SSO 즉시 일반회원으로 전환되어 가입 승인 대기 화면 폐지.
// 잔존 링크 / 외부 북마크 대비 / 로 리다이렉트.
const PendingPage = () => null;

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/dashboard', permanent: false },
});

export default PendingPage;
