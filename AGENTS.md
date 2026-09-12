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

자세한 문서 목록 및 구조는 [docs/README.md](file:///c:/dev/sokna/docs/README.md)를 참고하십시오.
