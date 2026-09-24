import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { PushMessageListener } from "@/components/push-message-listener";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: "소리로 크는 나무",
    template: "%s | 소리로 크는 나무",
  },
  description: "동아리 소개와 선곡회의 안내",
  appleWebApp: {
    capable: true,
    title: "소크나",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/logo_edited.png",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <PushMessageListener />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
