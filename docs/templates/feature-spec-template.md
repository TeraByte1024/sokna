# [기능명] 명세서

> **작성일자**: YYYY-MM-DD  
> **작성자**: (이름 또는 담당자)  
> **상태**: Draft / Review / Approved / Completed  

---

## 1. 배경 및 목적 (Background & Objectives)
- 해결하고자 하는 문제 또는 신규 요구사항
- 기능 도입으로 얻는 기대 효과

---

## 2. 세부 요구사항 (Requirements)

### 2.1 사용자 시나리오 (User Scenarios)
1. 사용자는 ...
2. 관리자는 ...

### 2.2 비즈니스 로직 및 제약사항
- 권한 요건 (예: 관리자만 가능, 해당 공연 참여자만 가능 등)
- 유효성 검사 규칙

---

## 3. 데이터 모델 변경 (Database Changes)

- [ ] 기존 테이블 유지
- [ ] 테이블 추가 또는 컬럼 수정 필요

### 스키마 명세 (필요 시)
| 테이블명 | 컬럼명 | 타입 | Nullable | 설명 |
| :--- | :--- | :--- | :--- | :--- |
| ... | ... | ... | ... | ... |

---

## 4. API / Server Action 명세

### `actionName(payload)`
- **경로 / 위치**: `app/.../actions.ts`
- **입력 파라미터**:
  ```ts
  interface ExamplePayload {
    // ...
  }
  ```
- **출력 결과**:
  ```ts
  type Result = { ok: true } | { ok: false; error: string };
  ```

---

## 5. UI / UX 설계 (Component Architecture)

- **신규 라우트**: `/...`
- **주요 컴포넌트**:
  - `components/...`: 역할 및 상태 관리

---

## 6. 테스트 및 검증 계획 (Verification Plan)

- [ ] 로컬 빌드 검증 (`npm run build`)
- [ ] 정상 케이스 동작 확인
- [ ] 예외/권한 에러 케이스 확인
- [ ] `docs/architecture/database-schema.md` 등 관련 문서 갱신
