import { NextResponse, type NextRequest } from "next/server";
import { authorized } from "@/lib/auth";
import { toPost } from "@/lib/media";
import { mongo } from "@/lib/mongo";
import { getProject } from "@/lib/projects";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

// The UI logs in with the cookie; automations read with the API key (one key covers every project).
export async function GET(req: NextRequest) {
  if (!authorized(req) && !(await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)))
    return NextResponse.json({ error: "Bejelentkezés szükséges." }, { status: 401 });
  const params = req.nextUrl.searchParams;
  const projectId = params.get("projectId") ?? params.get("project");
  if (!getProject(projectId)) return NextResponse.json({ error: "Ismeretlen projekt." }, { status: 400 });
  const externalId = params.get("externalId") ?? undefined;

  try {
    // shortcut: max 500 posts, no paging; add a cursor when a project outgrows it.
    const docs = await (await mongo())
      .collection("posts")
      .find({ projectId, externalId, status: { $ne: "archived" } })
      .sort({ scheduledAt: 1 })
      .limit(500)
      .toArray();
    const posts = await Promise.all(docs.map((d) => toPost(d, req.nextUrl.origin)));
    return NextResponse.json({ posts });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Nem sikerült betölteni a posztokat." }, { status: 500 });
  }
}
