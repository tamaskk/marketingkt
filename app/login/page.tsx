import { timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionToken } from "@/lib/session";

const sha = (s: string) => createHash("sha256").update(s).digest();

async function login(formData: FormData) {
  "use server";
  const password = process.env.HUB_PASSWORD;
  const given = String(formData.get("password") ?? "");
  if (!password || !timingSafeEqual(sha(password), sha(given))) redirect("/login?hiba=1");

  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const failed = (await searchParams).hiba === "1";
  return (
    <form action={login} className="mx-auto mt-16 max-w-sm">
      <h1 className="font-display text-3xl font-extrabold">Marketing Hub</h1>
      <label htmlFor="password" className="mt-6 block text-sm font-semibold">
        Jelszó
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoFocus
        autoComplete="current-password"
        className="mt-2 w-full rounded-xl border border-line bg-surface px-4 py-3"
      />
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          Hibás jelszó.
        </p>
      )}
      <button type="submit" className="mt-4 w-full rounded-xl bg-fg px-4 py-3 font-semibold text-bg">
        Belépés
      </button>
    </form>
  );
}
