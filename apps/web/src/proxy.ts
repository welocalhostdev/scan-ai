import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "scanai_token";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/scan/:path*", "/report/:path*"],
};
