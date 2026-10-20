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
   - 신규 테이블은 같은 마이그레이션에서 RLS, 정책, 역할별 명시적 `GRANT`를 함께 작성합니다. 아래 Data API 권한 절차를 따릅니다.
2. **타입 재생성**:
   - `npm run types`를 실행하여 `lib/supabase/database.types.ts`를 최신 상태로 갱신합니다.
3. **명세서 동기화**:
   - `docs/architecture/database-schema.md`에 추가/변경된 테이블 및 컬럼 설명을 반영합니다.
4. **빌드 검증**:
   - `npm run build`를 실행하여 변경된 타입으로 인한 컴파일 에러가 없는지 검증합니다.

## 4. Data API 자동 권한 변경 대응 (2026-10-30)

[Supabase 공지](https://github.com/orgs/supabase/discussions/45329)에 따라 기존 프로젝트에서도 새 `public` 테이블에 자동 Data API 권한이 부여되지 않습니다. 기존 테이블 권한은 보존됩니다. 새 프로젝트·미리보기 브랜치·DB reset으로 재생성한 테이블에도 명시적 권한이 필요합니다. 서버의 `supabase-js`도 Data API를 사용하며, `service_role`의 RLS 우회는 테이블 권한을 대체하지 않습니다.

### 4.1 현재 접근 계약

`20261020000000_make_data_api_grants_explicit.sql`은 아래 권한을 개별 테이블에 추가합니다. 기존 테이블 권한을 회수하지 않으므로 이 표는 **재생성 시 필요한 권한**이며, 기존 운영 권한의 상한을 의미하지 않습니다.

| 역할 | 테이블 | 명시적 권한 |
| :--- | :--- | :--- |
| `anon` | `gigs`, `performers`, `setlists`, `nominations`, `photos`, `users` | SELECT |
| `anon` | `admins` | SELECT: 기존 photos RLS의 admins 직접 참조에 필요. admins RLS가 비로그인 행 조회 차단 |
| `authenticated` | `admins`, `gig_rsvps`, `gigs`, `nomination_responses`, `nominations`, `performers`, `photos`, `profiles`, `setlists`, `users` | SELECT, INSERT, UPDATE, DELETE. 실제 쓰기 허용은 기존 RLS 판정 |
| `authenticated` | `setlist_views` | SELECT, INSERT, UPDATE (조회 시각 upsert) |
| `authenticated` | `notifications` | SELECT, INSERT (목록 조회·관리자 알림 생성 경로) |
| `service_role` | `users` | SELECT (발송 직전 수신 동의 확인) |
| `service_role` | `profiles`, `notifications` | SELECT, UPDATE, DELETE (기기 바인딩·정리, 발송 상태, 읽음·삭제) |

관리자도 사용자 세션에서는 `authenticated` 역할입니다. 승인 회원·관리자 여부는 RLS 및 기존 RPC 내부 검사가 판단합니다. 시퀀스는 `pg_get_serial_sequence`로 실제 소유 시퀀스를 찾아 로그인 쓰기 대상에만 USAGE를 부여합니다. 함수 실행 권한·RLS·트리거·데이터·기존 객체 권한·기본 권한 설정은 변경하지 않습니다. 12개 대상 테이블 중 하나라도 없거나 RLS가 꺼져 있으면 전체 마이그레이션을 중단합니다.

### 4.2 신규 테이블 작성 규칙

테이블 생성, RLS 활성화, 정책 생성, 실제 작업별 `GRANT`를 하나의 트랜잭션으로 묶습니다. 공개 조회가 없으면 `anon` 권한을 추가하지 않고, 서버 작업이 없다면 `service_role` 권한도 추가하지 않습니다. `ON ALL TABLES`·`ON ALL FUNCTIONS` 일괄 공개나 자동 권한 복원으로 해결하지 않습니다.

```sql
BEGIN;
CREATE TABLE public.example_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  body text NOT NULL
);
ALTER TABLE public.example_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own records" ON public.example_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert own records" ON public.example_records
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT ON TABLE public.example_records TO authenticated;
COMMIT;
```

upsert는 SELECT·INSERT·UPDATE를 모두 확인하고, RLS의 서브쿼리·관계 조회가 참조하는 테이블 권한도 확인합니다. serial/nextval 기본값이 있으면 실제 소유 시퀀스의 USAGE를 확인합니다. 권한 없는 요청의 `42501` 오류는 테이블 GRANT 누락과 RLS 거절을 구분해 조사합니다.

### 4.3 점검·적용·검증

1. `npx supabase db query --linked --file tests/data-api-grants-audit.sql --output json`으로 테이블·시퀀스·함수·정책·기본 권한 메타데이터를 보관합니다. 회원 데이터·기기 토큰은 조회하지 않습니다.
2. 격리 DB에서 `tests/run-data-api-grants-sql.mjs`를 실행합니다. `PGLITE_MODULE_PATH`에 기존 `@electric-sql/pglite/dist/index.js`의 절대 경로를 지정할 수 있습니다. 앱 의존성을 추가하거나 운영 DB에 테스트 행을 생성하지 않습니다.
3. `npx supabase db push --linked --dry-run`에서 해당 마이그레이션만 대기 중인지 확인하고 `npx supabase db push --linked --yes`로 적용합니다.
4. `npx supabase migration list --linked`와 동일 카탈로그 점검으로 적용 이력·필요 권한 및 기존 RLS·함수 ACL·기본 권한 보존을 확인합니다. `npm run types`로 타입을 재생성합니다. 권한만 변경하면 타입 내용이 동일할 수 있습니다.
5. 실제 Data API의 공개 조회·서버 서비스 역할 조회를 확인합니다. 격리 SQL 역할 검증은 실제 로그인 계정의 브라우저 E2E나 기기 푸시 수신 증거가 아닙니다.

격리 검증은 자동 테이블·시퀀스 권한이 없는 환경에서 공개/회원/비공개 공연 경계, 미승인 쓰기 거절, 본인 조회 시각 upsert, 타인 응답 거절, identity/serial 삽입, 기기 수신 동의와 서버 알림 처리를 확인합니다. RLS 없는 테이블의 사전 중단·원자적 롤백, 기존 함수 ACL·정책·기본 권한 보존, 미등록 테이블 비공개와 재실행도 확인합니다. photos·notifications의 초기 정책은 운영 카탈로그에 맞춘 격리 fixture이며 전체 운영 스키마 복제는 아닙니다.

현재 저장소는 최초 `users`·`gigs` 등 일부 테이블의 생성 DDL을 포함하지 않습니다. 따라서 이번 검증은 전체 과거 마이그레이션을 빈 DB에 재생한 `supabase db reset` 성공을 의미하지 않습니다. 새 프로젝트 전체 재구축에는 초기 스키마 baseline을 별도로 준비해야 합니다.

### 4.4 적용 기록

- 2026-10-20: 운영 12개 테이블의 RLS 활성화와 기존 세 역할의 CRUD 권한을 확인했습니다. 필요한 권한이 이미 있어 이 마이그레이션은 현재 운영 접근 범위를 확장하지 않습니다. `db push --dry-run`에서 해당 파일만 대기 중임을 확인했습니다.
- 자동 권한 없는 격리 PostgreSQL 검증 198개, 운영 Data API 읽기 점검 9개(anon 6개·service_role 3개)가 통과했습니다. 서비스 역할은 limit 0으로 응답 성공만 확인했습니다. 카탈로그·API 사전 증적은 로컬 `scratch/data-api-grants-before.json`·`scratch/data-api-grants-api-before.json`에 보관합니다.
- 전체 앱 테스트는 501개 중 500개가 통과했습니다. 수정하지 않은 `notification-menu.test.mjs`의 헤더 검증 하나는 `@/components/sokna-logo` mock 누락으로 실패했습니다. `npm run types`를 실행했고 테이블 타입은 동일하며 운영 메타데이터의 `PostgrestVersion`만 `14.5`에서 `14.4`로 갱신됐습니다.
- TypeScript·추가 SQL runner의 ESLint·`git diff --check`·production build가 통과했습니다. build는 최초 샌드박스의 Google Fonts 통신 제한으로 실패한 뒤 네트워크 가능한 환경에서 재실행해 성공했습니다.
- 운영 적용은 최초 자동 승인 검토에서 명시적 승인을 요구해 중단됐다가, 사용자의 "실제 동작에는 차이 없으면 적용" 승인 후 2026-10-20 완료했습니다. 적용 직전 필요한 모든 테이블·스키마·시퀀스 권한이 이미 존재함을 다시 확인했습니다.
- 원격 마이그레이션 이력에 `20261020000000` 반영을 확인했고, 후속 dry-run 결과는 `Remote database is up to date.`입니다. 적용 직전·후 카탈로그의 테이블 ACL/RLS, 시퀀스 ACL, 함수 실행 권한, 정책 정의, 스키마 접근 권한 및 기본 권한이 모두 동일합니다. 실제 API 읽기 9개도 적용 전과 같은 결과로 통과했습니다. 적용 후 `npm run types` 결과는 적용 직전과 동일합니다.
- 비교 증적은 로컬 `scratch/data-api-grants-preapply.json`·`scratch/data-api-grants-after.json`·`scratch/data-api-grants-api-after.json`에 보관합니다. 운영 데이터 쓰기, 시험 알림 발송, 실제 로그인 계정의 브라우저 E2E는 수행하지 않았습니다.
