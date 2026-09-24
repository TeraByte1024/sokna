import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://")
      ? [{
          protocol: "https",
          hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
          pathname: "/storage/v1/object/public/**",
        }]
      : [],
  },
  async redirects() {
    return [
    ];
  },
};

export default nextConfig;
