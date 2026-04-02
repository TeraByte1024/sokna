import { ClubLogo } from "@/components/club-logo";
import { CLUB_NAME } from "@/lib/club";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const photoSlots = [
  { id: "1", caption: "합주 / 공연" },
  { id: "2", caption: "정기 모임" },
  { id: "3", caption: "친목" },
] as const;

export function ClubLanding() {
  return (
    <div className="flex flex-col gap-12 w-full">
      <section className="flex flex-col sm:flex-row gap-8 items-center sm:items-start">
        <div className="shrink-0 rounded-2xl border bg-card p-4 shadow-sm">
          <span className="sr-only">동아리 로고</span>
          <ClubLogo className="size-[120px]" />
        </div>
        <div className="flex flex-col gap-3 text-center sm:text-left">
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
            {CLUB_NAME}
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
            동아리 소개와 활동 안내를 이곳에 적어 주세요. 공연 일정, 모집 정보,
            연락처 등을 추가하면 방문자에게 도움이 됩니다. 로고와 사진은{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">public/club/</code>{" "}
            폴더에 넣고 경로만 바꾸면 됩니다.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">사진</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {photoSlots.map(({ id, caption }) => (
            <Card key={id} className="overflow-hidden">
              <div
                className={cn(
                  "aspect-[4/3] bg-muted flex items-center justify-center",
                  "text-muted-foreground text-sm",
                )}
              >
                사진 추가 ({caption})
              </div>
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium">{caption}</CardTitle>
                <CardDescription className="text-xs">
                  public/club/에 이미지를 넣고 이 영역을 Image 컴포넌트로 교체하세요.
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>동아리 설명</CardTitle>
            <CardDescription>소개글 제목 아래 본문을 수정하세요.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed space-y-3">
            <p>
              여기에 동아리의 목적, 역사, 정기 활동, 신입 부원 모집 시기 등을
              자유롭게 작성할 수 있습니다.
            </p>
            <p>
              선곡 회의 일정과 안건은 상단 <strong className="text-foreground">선곡회의</strong>{" "}
              탭에서 다룰 수 있도록 페이지를 나누어 두었습니다.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
