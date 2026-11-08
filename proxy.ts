import { NextResponse, type NextRequest } from "next/server";
import { authorized } from "@/lib/auth";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

// Automations authenticate with the Bearer API key inside these handlers, not with the login cookie.
const PUBLIC = ["/login", "/api/upload", "/api/posts/batch"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /m/<assetId> is the public media link for Metricool & co.; the route itself checks the asset.
  if (PUBLIC.includes(pathname) || pathname.startsWith("/m/")) return NextResponse.next();
  // API-key holders may also read posts; each handler re-checks its own auth.
  if (pathname.startsWith("/api/") && authorized(req)) return NextResponse.next();
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Bejelentkezés szükséges." }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
