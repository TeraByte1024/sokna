import Image from "next/image";
import { CLUB_NAME_KOREAN } from "@/lib/club";
import { cn } from "@/lib/utils";

export function SoknaLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center md:h-6", className)}>
      <Image
        src="/logos/logo_sokna_color.svg"
        alt={CLUB_NAME_KOREAN}
        width={752}
        height={109}
        loading="eager"
        className="h-full w-auto dark:hidden"
      />
      <Image
        src="/logos/logo_sokna_white.svg"
        alt={CLUB_NAME_KOREAN}
        width={752}
        height={109}
        loading="eager"
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}
