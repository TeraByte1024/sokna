import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "소리로 크는 나무",
    short_name: "소크나",
    description: "동아리 공연과 선곡회의 안내",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/logo_edited.png",
        sizes: "684x684",
        type: "image/png",
      },
    ],
  };
}
