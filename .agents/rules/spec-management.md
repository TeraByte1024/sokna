---
description: 프로젝트 유지보수 및 신규 기능 개발 시 /docs 명세 관리 규칙
globs: ["**/*"]
---

# SOKNA 프로젝트 명세 관리 규칙

이 프로젝트의 모든 유지보수 및 신규 개발 작업은 `/docs` 폴더의 명세서를 기준으로 관리하고 수행합니다.

## 1. 개발 및 작업 전 확인 (Pre-implementation)
- 기존 기능 수정/버그 해결 전, 반드시 `docs/` 내의 관련 명세 문서를 먼저 검토합니다.
  - 시스템 전반: `docs/architecture/system-overview.md`
  - 데이터 모델: `docs/architecture/database-schema.md`
  - 기능별 명세: `docs/features/*.md`
- 신규 기능을 개발할 때는 `docs/templates/feature-spec-template.md` 양식에 맞춰 `docs/features/<기능명>.md`를 작성하거나 기존 명세에 추가한 후 구현을 진행합니다.

## 2. 작업 중 및 작업 후 문서 동기화 (Post-implementation)
- 비즈니스 로직, 권한, 인터페이스 등이 변경된 경우 해당 기능의 명세 문서를 즉시 갱신합니다.
- 데이터베이스 테이블, 컬럼, 외래키, RLS 정책이 변경된 경우:
  1. `docs/architecture/database-schema.md`에 변경 사항 반영
  2. `npm run types` 실행하여 `lib/supabase/database.types.ts` 갱신
- 신규 문서가 추가된 경우 `docs/README.md`의 인덱스 테이블에 새 문서를 등록합니다.
