# ONCELL

Next.js 기반 교회관리시스템 랜딩 페이지와 Kakao/Google SSO 연결 샘플입니다.

## 시작하기

1. 의존성 설치

```bash
npm install
```

2. 환경 변수 파일 생성

`cp .env.example .env.local`

3. `.env.local`에 클라이언트 ID 및 리디렉션 URI 채우기

4. 개발 서버 실행

```bash
npm run dev
```

## OAuth 로그인

- Kakao 로그인: `/api/auth/kakao`
- Google 로그인: `/api/auth/google`

환경 변수:

- `KAKAO_CLIENT_ID`
- `KAKAO_REDIRECT_URI`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_REDIRECT_URI`
