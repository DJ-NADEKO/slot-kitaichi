import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createAuthToken, getAppPassword } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const publicPath =
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico";

  if (publicPath) return NextResponse.next();

  const actual = request.cookies.get(AUTH_COOKIE_NAME)?.value || "";
  const expected = await createAuthToken(getAppPassword());
  if (actual === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ message: "認証が必要です。" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
