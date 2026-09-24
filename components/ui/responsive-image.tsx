import Image from "next/image";

interface ResponsiveImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  preload?: boolean;
}

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : null;

function canOptimize(src: string) {
  if (!supabaseOrigin) return false;
  try {
    const url = new URL(src);
    return url.origin === supabaseOrigin &&
      url.pathname.startsWith("/storage/v1/object/public/") &&
      !url.pathname.toLowerCase().endsWith(".svg");
  } catch {
    return false;
  }
}

/** Supabase 공개 이미지에만 Next 이미지 최적화를 적용합니다. */
export function ResponsiveImage({ src, alt, className, sizes, preload = false }: ResponsiveImageProps) {
  if (canOptimize(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} preload={preload} className={className} />;
  }

  return (
    // 외부 임의 URL은 Next 이미지 프록시에 전달하지 않습니다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading={preload ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={preload ? "high" : "auto"}
    />
  );
}
