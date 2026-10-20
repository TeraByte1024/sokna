# SOKNA 에이전트 및 개발 지침 (AGENTS.md)

## 프로젝트 명세 관리 원칙 (`/docs`)

**모든 유지보수 및 신규 기능 개발은 `/docs` 디렉토리 아래의 명세서를 기준으로 진행하며, 변경 사항은 즉시 문서에 동기화해야 합니다.**

1. **작업 시작 전**:
   - `docs/` 내의 관련 명세를 확인하여 기존 아키텍처 및 도메인 규칙을 파악합니다.
   - 신규 기능 개발 시 `docs/templates/feature-spec-template.md`를 참고하여 `docs/features/`에 명세를 작성합니다.
2. **작업 완료 후**:
   - 수정된 로직이나 API/Action 변경 사항을 해당 명세서에 반영합니다.
   - DB 스키마가 변경된 경우 `docs/architecture/database-schema.md` 갱신 및 `npm run types`를 실행합니다.
   - 신규 추가된 문서는 `docs/README.md`에 링크를 등록합니다.

## Supabase Data API 권한 원칙
- `public`의 새 테이블은 생성 마이그레이션 안에서 RLS 활성화, 정책 생성, 필요한 역할별 `GRANT`를 함께 작성합니다. 자동 권한 부여에 의존하지 않습니다.
- 브라우저뿐 아니라 서버의 `supabase-js`와 `service_role`도 명시적 테이블 권한이 필요합니다. 역할별 실제 작업과 RLS 정책의 참조 테이블까지 확인합니다.
- serial 기본값 등 시퀀스를 사용하는 경우 해당 시퀀스 권한도 별도로 확인합니다. 기존 RPC·트리거 함수의 실행 제한을 일괄 `GRANT EXECUTE`로 덮어쓰지 않습니다.
- 기존 운영 권한 축소나 기본 권한 변경을 호환성 작업에 섞지 않습니다. 자동 권한 없는 격리 DB에서 허용·거절 동작을 검증하며, 상세 절차는 `docs/maintenance/supabase-workflow.md`를 따릅니다.

## Git 작업 원칙
- **커밋 메시지는 반드시 영어로 작성**: 커밋 제목과 본문, 사용자에게 제안하는 커밋 메시지 모두 영어로 작성합니다. 대화가 한국어여도 이 규칙을 적용하며, 사용자가 해당 요청에서 다른 언어를 명시한 경우에만 예외로 합니다.
- **커밋 제목 컨벤션**: 커밋 제목과 사용자에게 제안하는 커밋 메시지는 `type: lowercase subject` 형식으로 작성합니다. 예: `feat: improve gig page loading`. 변경 유형에 맞는 Conventional Commits 타입(`feat`, `fix`, `docs`, `refactor`, `test`, `chore` 등)을 사용합니다.
- **임의 Push 금지**: 사용자의 명시적인 지시 없이는 어떠한 경우에도 임의로 `git push`를 실행하지 않습니다.

자세한 문서 목록 및 구조는 [docs/README.md](file:///c:/dev/sokna/docs/README.md)를 참고하십시오.
