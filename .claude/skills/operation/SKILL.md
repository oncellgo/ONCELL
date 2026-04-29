---
name: operation
description: ONCELL 운영 작업(DB 백업/복원, 대량 시드, wipe, 스키마 마이그레이션 등 scripts/ 실행)을 다룰 때 반드시 확인. Supabase 자격 증명·개인정보·복구 전략 관련 사고를 방지한다. "DB 백업", "백업 스크립트", "복원", "dump", "scripts/backup-*", "scripts/restore-*", "서비스 롤 키" 관련 요청 시 호출.
---

# operation — 운영 스크립트 실행 규칙

## 대상 스크립트

`scripts/` 하위 일괄 작업 전반. 특히:

- `scripts/backup-supabase.mjs` — 전 테이블 JSON dump
- `scripts/restore-supabase.mjs` — 백업 JSON → DB 복원
- `scripts/wipe-*.mjs` — 파괴적 삭제
- `scripts/seed-*.mjs` — 대량 삽입
- `scripts/migrate-*.mjs` — 스키마·데이터 이관

모두 `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 로 서버사이드 권한 접근.

## 주의사항 (반드시 준수)

### 1. 자격 증명 — `.env.local` 절대 커밋 금지
- `SUPABASE_SERVICE_ROLE_KEY` 는 **RLS 를 우회**하는 전 권한 키. 유출 시 전 테이블 읽기/쓰기/삭제 가능.
- `.env*` 는 `.gitignore` 에 포함되어 있음. `git add -A` 대신 명시적 파일만 stage.
- 새 스크립트 작성 시 키를 argv·로그·에러 메시지에 찍지 말 것.
- CLAUDE.md "금지사항" 섹션 원본 규칙.

### 2. 백업 파일 — 개인정보 포함, 로컬 안전 위치에 보관
- dump 안에 `oncell_profiles` / `oncell_users` / `oncell_signup_approvals` / `oncell_events` (예약자 이름·연락처) 등이 평문 JSON 으로 들어있음.
- 저장 위치: **repo 안 `backups/` (gitignore 됨)** 또는 암호화된 로컬 경로만.
  - `Dropbox/Google Drive` 공유 폴더·팀 채팅·이메일 첨부로 보내지 말 것.
  - 오래된 백업은 `--keep N` 로 자동 정리.
- 필요시 `7z a -p` 등으로 AES 암호화 압축 후 보관.
- 백업을 외부로 이동해야 한다면 **사용자 확인 필수**.

### 3. 복구 전략 — 수동 백업이 사실상 유일한 수단
- Supabase **Free plan 은 PITR(Point-in-Time Recovery) 미지원**.
- 자동 일일 백업도 Pro 이상에서만 제공되며, 본 프로젝트는 Free plan 전제.
- 실수로 `wipe-*` / `restore --mode replace` / 콘솔 직접 삭제 후 되돌릴 방법이 **로컬 dump 외에는 없다**.
- 따라서:
  - **파괴적 스크립트 실행 직전에는 무조건 최신 백업 확인** (`backups/` 최근 폴더 타임스탬프).
  - `scripts/backup-supabase.mjs` 를 Task Scheduler 로 최소 **일 1회** 자동 실행 권장.
  - 큰 변경(수십/수백 행) 직전에는 ad-hoc 로 한 번 더 dump.

## 실행 프로토콜 (공통)

1. **`.env.local` 존재 확인** — 없으면 스크립트가 즉시 종료됨 (OK).
2. **파괴적 작업(--execute 붙이기 직전)**: `scripts/backup-supabase.mjs` 한 번 실행 → `backups/<새 타임스탬프>/manifest.json` 생성 확인.
3. **dry-run 먼저** — 모든 배치 스크립트는 기본이 dry-run. 출력된 건수가 기대와 맞는지 사용자와 확인.
4. **`--execute` 는 사용자 명시 승인 후에만**.
5. 실행 후 `manifest.json` / 로그 요약 보여주고, 특이값(0건·예상과 다른 건수)은 즉시 보고.

## 백업 / 복원 빠른 참조

```bash
# 전체 백업 (backups/<ISO>/ 에 저장, 기본 읽기 전용)
node scripts/backup-supabase.mjs
node scripts/backup-supabase.mjs --keep 14      # 14개만 보존
node scripts/backup-supabase.mjs --out D:/kcis-bk

# 복원 — 기본 dry-run, upsert 모드
node scripts/restore-supabase.mjs backups/2026-04-23T12-00-00-000

# 특정 테이블만 (prefix 생략 가능)
node scripts/restore-supabase.mjs backups/<stamp> --execute --tables events,qt_notes

# 완전 복제 (백업에 없는 행 삭제 — 파괴적)
node scripts/restore-supabase.mjs backups/<stamp> --execute --mode replace
```

### `restore --mode replace` 추가 경고
- `oncell_app_kv` 포함 시 `system_admins` 키가 덮어써짐 → 백업 시점 이후 관리자 변경 내역이 증발, 로그인 불가 상태가 될 수 있음.
- 기본값 `upsert` 로 충분한 경우가 대부분. `replace` 는 "완전 복제가 꼭 필요"하다고 확신할 때만.

## 정기 실행 (Windows Task Scheduler)

- 프로그램: `C:\Program Files\nodejs\node.exe`
- 인수: `scripts/backup-supabase.mjs --keep 14`
- 시작 위치: `c:\CHSA\claude_eunice\kcis`
- 트리거 예: 매일 02:00.
- 백업 디렉터리는 주기적으로 외부 암호화 저장소로 복사(수동 OK).

## 연관

- `CLAUDE.md` §"금지사항" — 파괴적 Supabase 작업·`.env.local` 커밋 금지
- `.claude/skills/church-events/SKILL.md` — 시드 전용 규약(백업과 독립적으로 dry-run 원칙 공유)
- `lib/db.ts` / `lib/dataStore.ts` — 테이블 목록·PK 정의 (백업/복원 스크립트가 이 정의와 동기화되어야 함)
