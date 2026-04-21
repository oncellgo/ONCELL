---
name: tech-audit
description: 번들 크기·쿼리 수·SSR/CSR 분담·캐시 전략·Vercel 함수 제약·Supabase 사용량을 감사하고 실제 문제만 골라 개선한다. "느려졌어", "쿼리 너무 많아", "빌드 크기 커", "Vercel 비용 줄이자" 류에 호출.
---

# tech-audit — 기술 최적화 감사 프로토콜

원칙: **"가장 적은 리소스로 같은 UX를 제공한다."** 과도 최적화는 부채 — 지금 **실제 문제**만 손댄다.

## 1) 감사 순서 (상 → 하)

1. **첫 화면 로드** — SSR 페이로드(getServerSideProps 반환값), HTML 크기, 첫 byte 시간 가정.
2. **API 트래픽** — 페이지 진입 시 발생하는 fetch 수 · 병렬/순차 여부.
3. **DB 쿼리** — Supabase/파일 read 횟수. N+1 패턴 탐지.
4. **캐시 계층** — mem cache · Supabase kv(`kcis_app_kv`) · CDN·브라우저 캐시 헤더.
5. **번들** — 동적 import 누락된 큰 컴포넌트, 전역 import된 venue 전체 리스트 등.
6. **이미지** — `loading="lazy"`, 작은 썸네일 사용.
7. **Vercel 함수 제약** — 타임아웃, 콜드스타트, 동시성.

## 2) 측정 먼저
- `grep`으로 fetch/getEvents/expandOccurrences 호출 위치 카운트.
- 파일 크기: `wc -c data/*.json`, `ls -la .next/static`.
- 느리다고 **가정하지 말고** 근거를 확보 후 제안.

## 3) 흔한 함정 (KCIS)
- `expandOccurrences` 범위가 ±6개월로 커지면 수백 occurrence → **범위를 뷰에 맞춰 좁히기**.
- `getEvents()` 호출이 같은 요청에서 여러 번 → `Promise.all` 또는 dedup.
- `venue-blocks` 사전 생성 금지, **on-demand 계산** 유지.
- 큐티 매일성경 3단 캐시 (mem 30m → Supabase kv 영구 → upstream) 순서 준수.
- `data/*.json` → Supabase 이관 후 `lib/dataStore` 경유 중복 제거.

## 4) 바꿀 때 지킬 것
- **측정 → 변경 → 재측정** 루프. 변경만 하고 끝내지 않는다.
- 설정·캐시 TTL을 바꿨으면 plan.md 해당 줄 동기화.
- 사용자 visible 지표(로딩 시간·깜빡임)를 건드리는 변경은 UX-designer 협의.
- legacy-peer-deps, TS/ESLint 빌드 스킵 설정은 **함부로 풀지 말 것** (commit 256f6c6 맥락).

## 5) 산출물 형식
- **감사 결과 표**: 위치(file:line) · 현재 비용 · 제안 · 예상 절감(%)
- **가장 임팩트 큰 한 가지**부터 변경. PR 쪼개기.
- **롤백 플랜** — 문제 시 되돌리기.

## 6) 소속/연계
- **소속 에이전트**: `tech-optimizer` (`.claude/agents/tech-optimizer.md`) — 이 스킬은 그 에이전트의 실행 프로토콜.
- **UX visible 변경 발생** (로딩 시간·깜빡임·레이아웃) → `ux-designer` 에이전트 / `ux-review` 스킬에 협의.
- **기능 범위 축소·재설계 필요** → `service-planner` 에이전트 / `service-plan` 스킬에 스펙 재질의.
