# Database Setup — Neon Postgres

이 디렉토리는 Vercel(Neon) Postgres 마이그레이션 리소스를 담고 있습니다.

## 순서

### 1. Neon 데이터베이스 연결 (Vercel Dashboard)

1. https://vercel.com 프로젝트 → **Storage** → **Create** → **Neon Postgres**
2. 자동으로 아래 환경변수가 등록됩니다:
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NON_POOLING`
   - `POSTGRES_USER`, `POSTGRES_HOST`, ...

### 2. 로컬 환경변수 가져오기

```bash
npm i -g vercel
vercel link           # 프로젝트 연결
vercel env pull .env.local
```

`.env.local` 에 `POSTGRES_URL=...` 등이 생깁니다.

### 3. 의존성 설치

```bash
npm install @neondatabase/serverless
npm install -D tsx dotenv
```

### 4. 스키마 적용

Neon Dashboard의 SQL Editor에서 `db/schema.sql` 내용을 붙여넣거나, 로컬에서 psql로 실행:

```bash
psql "$POSTGRES_URL" -f db/schema.sql
```

### 5. 기존 JSON 데이터 이관

```bash
npx tsx db/migrate-from-json.ts
```

`data/*.json` 파일을 읽어 Postgres에 import합니다. 안전하게 idempotent(중복 실행 OK).

### 6. 확인

```bash
psql "$POSTGRES_URL" -c "SELECT count(*) FROM communities;"
psql "$POSTGRES_URL" -c "SELECT count(*) FROM worship_services;"
```

## 이후 작업 (코드 마이그레이션)

`pages/api/**` 핸들러에서 `fs.readFile`/`writeFile` 패턴을 `lib/db.ts`의 `sql` 템플릿으로 교체합니다. 진행 순서 예시:

1. `pages/api/communities/*` ← 가장 핵심
2. `pages/api/communities/[id]/worship-services.ts`
3. `pages/api/communities/[id]/design.ts`
4. `pages/api/events.ts`
5. `pages/api/admin/*`
6. `pages/api/ai/translate.ts`
7. `lib/communityTemplates.ts`

## 백업 전략

- `data/*.json` 파일은 **삭제하지 마세요**. 롤백 여지로 일단 보존.
- 프로덕션은 Postgres 단일 source of truth.
- 로컬 개발 시에도 `.env.local`에 POSTGRES_URL 있으면 DB 사용.
