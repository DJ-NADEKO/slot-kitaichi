import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createAuthToken, getAppPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password?.trim() || "";
  } catch {
    return NextResponse.json({ message: "入力内容を確認してください。" }, { status: 400 });
  }

  if (password !== getAppPassword()) {
    return NextResponse.json({ message: "パスワードが違います。" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, await createAuthToken(getAppPassword()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
