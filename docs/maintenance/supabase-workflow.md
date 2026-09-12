# Supabase 마이그레이션 및 타입 관리 워크플로우 (Supabase Workflow)

## 1. 개요
SOKNA 프로젝트는 Supabase를 주 백엔드 데이터베이스로 사용하며, TypeScript 타입 안정성을 위해 데이터베이스 스키마와 프론트엔드 코드의 동기화를 철저히 관리합니다.

---

## 2. 타입 정의 파일 (`lib/supabase/database.types.ts`)

- 모든 Supabase 쿼리는 `Database` 인터페이스를 통해 강력한 타입 추론을 제공받습니다.
- 테이블 스키마, 컬럼, 외래키, Enum 또는 RPC 함수가 변경되면 반드시 타입 파일을 재생성해야 합니다.

### 2.1 타입 재생성 명령
```bash
npm run types
```
내부 실행 명령:
```bash
npx supabase gen types typescript --linked > lib/supabase/database.types.ts
```

> [!NOTE]
> `npm run types`를 실행하려면 사전에 `npx supabase login` 및 `npx supabase link --project-ref <PROJECT_REF>`가 완료되어 있어야 합니다.

---

## 3. 스키마 변경 시 필수 체크리스트

1. **마이그레이션 작성**:
   - `supabase/migrations/` 폴더에 타임스탬프 기반 SQL 마이그레이션 파일을 추가하거나 대시보드에서 안전하게 DDL을 적용합니다.
2. **타입 재생성**:
   - `npm run types`를 실행하여 `lib/supabase/database.types.ts`를 최신 상태로 갱신합니다.
3. **명세서 동기화**:
   - `docs/architecture/database-schema.md`에 추가/변경된 테이블 및 컬럼 설명을 반영합니다.
4. **빌드 검증**:
   - `npm run build`를 실행하여 변경된 타입으로 인한 컴파일 에러가 없는지 검증합니다.
