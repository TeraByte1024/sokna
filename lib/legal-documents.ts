export type LegalDocumentKind = "terms" | "privacy";
export type LegalDocument = {
  kind: LegalDocumentKind;
  postedOn: string;
  title: string;
  content: string;
  published: boolean;
};

export type LegalDocumentRevision = {
  postedOn: string;
  publiclyListed?: boolean;
  changeSummary: string;
  documents: readonly LegalDocument[];
};

// Service documents and their revisions are tracked with the application source.
// Publication remains disabled until the consent migration is applied.
const SERVICE_LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    kind: "terms",
    published: false,
    title: "이용약관 동의",
    content: `제1조 목적
이 약관은 소리로 크는 나무의 공연 정보 및 동아리 활동 서비스 이용에 필요한 권리와 의무를 정합니다.

제2조 계정과 회원 권한
이메일 또는 소셜 계정으로 가입할 수 있습니다. 동아리 회원 권한은 별도 신청과 운영진 승인 후 부여되며, 승인 전에도 일반 계정으로 이용할 수 있습니다.

제3조 이용자의 의무와 이용 제한
이용자는 계정을 안전하게 관리하고 타인의 정보 도용, 개인정보 무단 공개, 서비스 운영 방해 등 위법하거나 부당한 행위를 해서는 안 됩니다. 운영진은 위반의 정도에 따라 필요한 범위에서 이용을 제한할 수 있으며, 사유를 안내하고 이의신청을 받습니다.

제4조 서비스 변경과 탈퇴
점검이나 장애 등으로 서비스가 변경·중단될 수 있으며, 운영진은 사유와 이용에 영향을 주는 사항을 안내합니다. 이용자는 제공되는 프로필의 탈퇴 기능 또는 문의 이메일로 계정 탈퇴를 요청할 수 있고, 본인 확인 후 처리합니다. 동아리 탈퇴와 서비스 계정 탈퇴는 구분하며, 개인정보의 파기·보존은 관련 법령과 개인정보처리방침에 따릅니다.

제5조 약관 변경
약관을 변경하면 적용일과 변경 내용을 사전에 안내하고 관련 법령에 따른 고지·통지 절차를 따르며, 이전 약관과 변경 이력은 보관합니다. 로그인한 계정이 현재 적용되는 약관에 동의하지 않았다면 동의 창을 표시합니다.

제6조 문의 및 이의신청
서비스 이용, 탈퇴 및 이의신청은 sokna1986hanyang@gmail.com으로 접수합니다. 이 약관에 정하지 않은 사항은 대한민국의 관련 법령에 따릅니다.`,
    postedOn: "2026-10-23"
  },
  {
    kind: "privacy",
    published: false,
    title: "개인정보 수집·이용 동의",
    content: `1. 수집·이용 목적
계정 생성·로그인, 이용자 식별, 서비스 제공 및 약관 동의 이력 관리

2. 수집 항목
계정 식별자, 이메일, 비밀번호(이메일 가입), 로그인 제공자, 동의한 약관 및 동의 시각
소셜 로그인 시 제공자로부터 이메일과 해당 로그인 방식이 제공하는 기본 프로필 정보(이름·프로필 사진 등)를 수신합니다. 동아리 회원 권한 요청에 필요한 정보는 해당 신청 화면에서 별도로 안내합니다.

3. 보유 및 이용 기간
서비스 계정 탈퇴 시까지 보유하며, 탈퇴 시 파기합니다. 법령상 보존 의무가 있는 기록은 해당 법령의 기간 동안 분리 보관합니다.

4. 동의 거부 및 철회
동의를 거부할 수 있으나, 필수 정보 처리에 동의하지 않으면 계정 기반 서비스 이용이 제한됩니다. 동의 철회·탈퇴·개인정보 관련 요청은 sokna1986hanyang@gmail.com으로 접수합니다.
`,
    postedOn: "2026-10-23"
  }
];

export const LEGAL_DOCUMENT_HISTORY: readonly LegalDocumentRevision[] = [{
  postedOn: "2026-10-23",
  publiclyListed: true,
  changeSummary: "이용약관 및 개인정보 수집·이용 안내 등록",
  documents: SERVICE_LEGAL_DOCUMENTS,
}];

export const LEGAL_DOCUMENTS = LEGAL_DOCUMENT_HISTORY[LEGAL_DOCUMENT_HISTORY.length - 1]?.documents ?? [];
