import { GetServerSideProps } from 'next';
import Head from 'next/head';
import SubHeader from '../components/SubHeader';
import { getSystemAdminHref } from '../lib/adminGuard';
import { useIsMobile } from '../lib/useIsMobile';

type Props = {
  profileId: string | null;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  systemAdminHref: string | null;
};

const PrivacyPage = ({ profileId, displayName, nickname, email, systemAdminHref }: Props) => {
  const isMobile = useIsMobile();
  const effectiveDate = '2026-04-24';

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ display: 'grid', gap: '0.6rem' }}>
      <h3 style={{ margin: 0, fontSize: isMobile ? '0.95rem' : '0.98rem', color: 'var(--color-ink)', fontWeight: 800, wordBreak: 'keep-all' }}>{title}</h3>
      <div style={{ color: 'var(--color-ink)', fontSize: isMobile ? '0.88rem' : '0.9rem', lineHeight: 1.8, wordBreak: 'keep-all' }}>{children}</div>
    </div>
  );

  const Item = ({ children }: { children: React.ReactNode }) => (
    <li style={{ margin: '0 0 0.25rem 0' }}>{children}</li>
  );

  return (
    <>
      <Head>
        <title>KCIS | 개인정보처리방침</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref} />

      <main style={{ maxWidth: 840, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: '1.25rem' }}>
        <section style={{ padding: isMobile ? '1rem 0.9rem' : '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.3rem', color: 'var(--color-ink)' }}>개인정보처리방침</h2>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.85rem', lineHeight: 1.75, wordBreak: 'keep-all' }}>
              싱가폴 한인교회(이하 "교회")는 KCIS 장소신청 시스템(이하 "서비스") 이용자의 개인정보를 소중히 다루며, 싱가포르 Personal Data Protection Act(PDPA) 및 관련 법령에 따라 다음과 같이 처리하고 있습니다.
            </p>
          </div>

          <Section title="1. 수집하는 개인정보 항목">
            <p style={{ margin: '0 0 0.4rem' }}>서비스는 회원 가입 및 이용 과정에서 아래 정보를 수집합니다.</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item><strong>OAuth 제공자(카카오/구글)에서 전달받는 정보</strong> — 닉네임, 이메일 주소, 제공자 고유 식별자</Item>
              <Item><strong>회원이 직접 입력하는 정보</strong> — 실명, 연락처</Item>
              <Item><strong>서비스 이용 기록</strong> — 예약 제목·시간·장소, 묵상노트, 큐티·성경통독 일별 완료 이력</Item>
            </ul>
          </Section>

          <Section title="2. 수집 및 이용 목적">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>교회 공간(예배실·모임실 등) 예약 신청·확인·취소 처리</Item>
              <Item>가입 처리 — 교회 운영 정책에 따라 가입 직후 자동 승인</Item>
              <Item>개인 묵상노트 저장·조회(본인에게만 공개)</Item>
              <Item>부정 이용 방지, 장애 대응, 서비스 개선</Item>
            </ul>
          </Section>

          <Section title="3. 보유 및 이용 기간">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>회원 정보: 회원 탈퇴 시까지</Item>
              <Item>예약 기록: 회원탈퇴 시 까지</Item>
              <Item>묵상노트: 회원이 직접 삭제하거나 회원 탈퇴 시까지</Item>
              <Item>로그인 기록: 회원탈퇴 시 삭제</Item>
            </ul>
          </Section>

          <Section title="4. 제3자 제공">
            <p style={{ margin: 0 }}>교회는 법령에 근거하거나 이용자의 사전 동의가 있는 경우를 제외하고는 이용자의 개인정보를 외부에 제공하지 않습니다.</p>
          </Section>

          <Section title="5. 개인정보 처리 위탁 및 국외 이전">
            <p style={{ margin: '0 0 0.4rem' }}>서비스 운영을 위해 아래 외부 업체를 통해 개인정보를 저장·처리합니다. 위탁 업체는 각자의 개인정보처리방침을 따르며, 개인정보는 업무 수행 목적 범위 내에서만 이용됩니다.</p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item><strong>Supabase Inc.</strong> (미국) — 데이터베이스 저장·인증 토큰 관리</Item>
              <Item><strong>Vercel Inc.</strong> (미국) — 애플리케이션 호스팅 및 로그</Item>
              <Item><strong>Kakao Corp.</strong> (대한민국) — 카카오 소셜 로그인(OAuth) 인증</Item>
              <Item><strong>Google LLC</strong> (미국) — 구글 소셜 로그인(OAuth) 인증 및 음성 합성(TTS)</Item>
            </ul>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.85rem' }}>
              이용자의 개인정보는 위 업체를 통해 미국·대한민국에 저장·처리될 수 있습니다(국외 이전). 교회는 위탁 업체 선정 시 개인정보 보호 수준이 적절한지 확인하며, 전송 구간은 TLS 암호화로 보호됩니다.
            </p>
          </Section>

          <Section title="6. 이용자의 권리">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>회원 탈퇴 신청 (신청 즉시 처리완료)</Item>
              <Item>동의 철회 — 로그아웃 및 계정 삭제로 언제든지 가능</Item>
            </ul>
          </Section>

          <Section title="7. 개인정보 보호책임자 및 문의">
            <div style={{ padding: isMobile ? '0.85rem' : '0.7rem 0.9rem', borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'grid', gap: '0.35rem' }}>
              <strong style={{ fontSize: '0.98rem' }}>싱가폴한인교회</strong>
              <div style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>21 Gangsa Road Singapore 678973</div>
              <div style={{ fontSize: '0.88rem' }}>📞 <a href="tel:+6564686694" style={{ color: '#1E40AF', textDecoration: 'none', fontWeight: 700, display: 'inline-block', minHeight: 32, lineHeight: '32px' }}>+65-6468-6694</a></div>
              <div style={{ fontSize: '0.88rem' }}>✉️ <a href="mailto:koreanchurch@live.com" style={{ color: '#1E40AF', textDecoration: 'none', fontWeight: 700, display: 'inline-block', minHeight: 32, lineHeight: '32px' }}>koreanchurch@live.com</a></div>
            </div>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.85rem' }}>개인정보 열람·정정·삭제·처리정지 요청, 방침 관련 문의는 위 연락처로 접수해 주세요.</p>
          </Section>

          <Section title="8. 개인정보 안전성 확보 조치">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item><strong>전송 구간 암호화</strong> — 모든 통신은 TLS(HTTPS)로 암호화됩니다.</Item>
              <Item><strong>접근 통제</strong> — 관리자 기능은 별도 인증 토큰으로 보호되며, 일반 회원은 본인 정보만 열람·수정 가능합니다.</Item>
              <Item><strong>인증 정보 최소 보관</strong> — 비밀번호는 저장하지 않으며, OAuth 제공자(카카오/구글)의 인증 토큰으로만 로그인합니다.</Item>
              <Item><strong>접속 기록 관리</strong> — 서비스 이용 기록은 부정 접근 추적 및 장애 대응 목적으로 보관됩니다.</Item>
            </ul>
          </Section>

          <Section title="9. 방침 변경">
            <p style={{ margin: 0 }}>본 방침은 법령·서비스 변경 사항에 따라 개정될 수 있으며, 주요 변경이 있는 경우 시행일 7일 전 서비스 공지로 안내합니다. 이전 방침은 요청 시 열람할 수 있습니다.</p>
          </Section>

          <div style={{ marginTop: '0.5rem', padding: '0.7rem 0.9rem', borderRadius: 10, background: '#F9FAFB', border: '1px solid var(--color-surface-border)', fontSize: '0.8rem', color: 'var(--color-ink-2)' }}>
            시행일: {effectiveDate}
          </div>
        </section>
      </main>
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

export default PrivacyPage;
