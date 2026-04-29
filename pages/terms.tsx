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

const TermsPage = ({ profileId, displayName, nickname, email, systemAdminHref }: Props) => {
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
        <title>ONCELL | 이용약관</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <SubHeader profileId={profileId} displayName={displayName} nickname={nickname} email={email} systemAdminHref={systemAdminHref} />

      <main style={{ maxWidth: 840, margin: '0 auto', padding: isMobile ? '1rem 0.6rem 4rem' : '1.5rem 1rem 5rem', display: 'grid', gap: '1.25rem' }}>
        <section style={{ padding: isMobile ? '1rem 0.9rem' : '1.5rem', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-surface-border)', boxShadow: 'var(--shadow-card)', display: 'grid', gap: '1.25rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isMobile ? '1.15rem' : '1.3rem', color: 'var(--color-ink)' }}>이용약관</h2>
            <p style={{ margin: '0.4rem 0 0', color: 'var(--color-ink-2)', fontSize: '0.85rem', lineHeight: 1.75, wordBreak: 'keep-all' }}>
              본 약관은 싱가폴 한인교회(이하 "교회")가 운영하는 ONCELL 장소신청 시스템(이하 "서비스")의 이용 조건과 절차, 교회와 이용자 간의 권리·의무 및 책임사항을 규정합니다.
            </p>
          </div>

          <Section title="제1조 (목적)">
            <p style={{ margin: 0 }}>본 약관은 교회가 제공하는 서비스를 이용자가 이용함에 있어, 이용자와 교회의 권리·의무·책임·기타 필요한 사항을 규정함을 목적으로 합니다.</p>
          </Section>

          <Section title="제2조 (용어의 정의)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item><strong>이용자</strong> — 본 약관에 따라 서비스를 이용하는 교회 성도 및 방문자</Item>
              <Item><strong>회원</strong> — 카카오 또는 구글 계정으로 로그인하여 서비스에 가입한 이용자</Item>
              <Item><strong>서비스</strong> — 교회 공간 예약, 큐티, 성경통독, 공지 등 ONCELL 가 제공하는 모든 기능</Item>
              <Item><strong>관리자</strong> — 교회에서 정한 시스템관리자</Item>
            </ul>
          </Section>

          <Section title="제3조 (약관의 효력 및 변경)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.</Item>
              <Item>교회는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 개정 시 적용일자와 개정 사유를 명시하여 서비스 공지를 통해 사전 고지합니다.</Item>
              <Item>이용자가 개정 약관에 동의하지 않는 경우, 회원 탈퇴를 요청할 수 있습니다.</Item>
            </ul>
          </Section>

          <Section title="제4조 (회원가입 및 정보수집)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>이용자는 카카오 또는 구글 계정 인증을 통해 가입 신청을 할 수 있습니다.</Item>
              <Item>회원은 장소 예약 등 특정 서비스 이용을 위해 실명과 연락처를 추가로 등록해야 합니다. 이를 거부하거나 정확한 정보를 제공하지 않을 경우, 해당 서비스 이용이 제한될 수 있습니다.</Item>
              <Item>회원가입은 교회 운영 정책에 따라 <strong>가입 직후 자동 승인</strong>을 원칙으로 합니다. 단, 운영상 필요에 따라 관리자의 승인 절차가 추가될 수 있습니다.</Item>
              <Item>교회는 이용자가 제공한 정보가 사실과 다르거나 타인의 명의를 도용한 경우, 가입 승인을 취소하거나 서비스 이용 자격을 즉시 제한할 수 있습니다.</Item>
            </ul>
          </Section>

          <Section title="제5조 (이용자의 의무)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>이용자는 관련 법령, 본 약관, 교회 공지사항 및 서비스 이용 안내를 준수해야 합니다.</Item>
              <Item>타인의 개인정보를 도용하거나 허위 정보를 등록해서는 안 됩니다.</Item>
              <Item>허위 정보를 등록하여 발생한 모든 불이익은 이용자 본인에게 있으며, 관리자는 사전 고지 없이 예약을 취소하거나 이용 자격을 정지할 수 있습니다.</Item>
              <Item>예약 기능을 이용한 상업적 목적의 공간 전용·전매 행위는 금지됩니다.</Item>
              <Item>다른 이용자에게 불쾌감을 주거나 신앙 공동체의 질서를 해치는 언행을 해서는 안 됩니다.</Item>
            </ul>
          </Section>

          <Section title="제6조 (서비스 제공 및 중단)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>서비스는 연중무휴 24시간 제공을 원칙으로 합니다.</Item>
              <Item>정기점검·시스템 장애·천재지변·교회 사정 등으로 불가피한 경우 일시 중단될 수 있으며, 사전 공지가 어려운 경우가 있습니다.</Item>
              <Item>교회는 운영상·기술상 필요에 따라 서비스의 일부 또는 전부를 변경·중단할 수 있습니다.</Item>
            </ul>
          </Section>

          <Section title="제7조 (면책조항)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>교회는 천재지변·불가항력·이용자의 귀책사유로 인한 서비스 이용 장애에 대해 책임을 지지 않습니다.</Item>
              <Item>이용자 간 또는 이용자와 제3자 간 서비스를 매개로 발생한 분쟁에 대해 교회는 개입할 의무가 없으며, 이로 인한 손해에 대해 책임을 지지 않습니다.</Item>
              <Item>이용자가 본인의 계정·비밀번호 관리를 소홀히 하여 발생한 피해는 본인이 책임집니다.</Item>
            </ul>
          </Section>

          <Section title="제8조 (회원 탈퇴 및 자격 상실)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>회원은 언제든지 프로필 설정에서 회원 탈퇴를 요청할 수 있으며, 탈퇴 시 관련 개인정보는 개인정보처리방침에 따라 처리됩니다.</Item>
              <Item>교회는 회원이 본 약관 또는 관련 법령을 위반하거나, 교회 공동체의 질서를 해치는 행위를 할 경우 사전 통지 후 회원 자격을 제한하거나 상실시킬 수 있습니다.</Item>
            </ul>
          </Section>

          <Section title="제9조 (콘텐츠의 저작권 및 이용권한)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>서비스 내 교회가 제작한 콘텐츠(주보·설교영상·구역예배지 등)의 저작권은 교회에 귀속됩니다.</Item>
              <Item>회원이 서비스 내에 게시하거나 입력한 묵상노트, 성경통독 기록 등 콘텐츠의 저작권은 회원 본인에게 귀속됩니다.</Item>
              <Item>교회는 서비스의 원활한 운영, 유지보수 및 백업을 위한 범위 내에서 해당 콘텐츠를 보관하고 서비스 화면에 표시할 수 있는 권리를 가집니다.</Item>
              <Item>회원이 탈퇴할 경우, 본인이 작성한 콘텐츠는 즉시 파기되며 복구가 불가능합니다. (단, 본인이 직접 백업하지 않은 데이터의 손실에 대해서는 교회가 책임지지 않습니다.)</Item>
            </ul>
          </Section>

          <Section title="제10조 (준거법 및 관할)">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <Item>본 약관의 해석 및 교회와 이용자 간 분쟁은 싱가포르의 법률을 준거법으로 합니다.</Item>
              <Item>서비스 이용과 관련한 분쟁은 싱가포르 관할 법원을 제1심 관할 법원으로 합니다.</Item>
              <Item>단, 한국 거주 이용자의 경우 관련 법령에 따라 대한민국 법률이 준거법으로 적용될 수 있습니다.</Item>
            </ul>
          </Section>

          <Section title="제11조 (문의)">
            <div style={{ padding: isMobile ? '0.85rem' : '0.7rem 0.9rem', borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', display: 'grid', gap: '0.35rem' }}>
              <strong style={{ fontSize: '0.98rem' }}>ONCELL</strong>
              <div style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>21 Gangsa Road Singapore 678973</div>
              <div style={{ fontSize: '0.88rem' }}>📞 <a href="tel:+6564686694" style={{ color: '#1E40AF', textDecoration: 'none', fontWeight: 700, display: 'inline-block', minHeight: 32, lineHeight: '32px' }}>+65-6468-6694</a></div>
              <div style={{ fontSize: '0.88rem' }}>✉️ <a href="mailto:koreanchurch@live.com" style={{ color: '#1E40AF', textDecoration: 'none', fontWeight: 700, display: 'inline-block', minHeight: 32, lineHeight: '32px' }}>koreanchurch@live.com</a></div>
            </div>
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

export default TermsPage;
