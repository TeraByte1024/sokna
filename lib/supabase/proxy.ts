import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error(
        "[Proxy/Middleware] Supabase environment variables are missing! NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not defined.",
      );
      return NextResponse.next({ request });
    }

    let supabaseResponse = NextResponse.next({
      request,
    });

    // With Fluid compute, don't put this client in a global environment
    // variable. Always create a new one on each request.
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    // Do not run code between createServerClient and
    // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.
    const { data } = await supabase.auth.getClaims();
    const user = data?.claims;

    const pathname = request.nextUrl.pathname;
    if (user && pathname === "/auth/login") {
      const redirectParam = request.nextUrl.searchParams.get("redirect");
      let destination = new URL("/", request.url);

      if (
        redirectParam?.startsWith("/") &&
        !redirectParam.startsWith("//") &&
        !redirectParam.includes("\\")
      ) {
        const candidate = new URL(redirectParam, request.url);
        if (
          candidate.origin === request.nextUrl.origin &&
          candidate.pathname.replace(/\/+$/, "") !== "/auth/login"
        ) {
          destination = candidate;
        }
      }

      const response = NextResponse.redirect(destination);
      supabaseResponse.cookies.getAll().forEach((cookie) =>
        response.cookies.set(cookie),
      );
      return response;
    }

    const isPublicGigRoute =
      pathname === "/gigs" ||
      (/^\/gigs\/\d+$/.test(pathname));

    const isPublicRoute =
      pathname === "/" ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/auth") ||
      // 푸시 서비스 워커는 로그아웃 상태에서도 갱신·실행할 수 있어야 합니다.
      pathname === "/firebase-messaging-sw.js" ||
      // 외부 스케줄러는 사용자 세션이 없습니다. cron 라우트 자체에서
      // CRON_SECRET Bearer 토큰을 검증하므로 로그인 리다이렉트만 제외합니다.
      pathname.startsWith("/api/cron/") ||
      pathname.startsWith("/40th-anniversary") ||
      isPublicGigRoute;

    if (!user && !isPublicRoute) {
      // no user, potentially respond by redirecting the user to the login page
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (error) {
    console.error("[Proxy/Middleware Error]:", error);
    return NextResponse.next({ request });
  }
}
