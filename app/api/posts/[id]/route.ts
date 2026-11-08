import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { authorized } from "@/lib/auth";
import { toPost } from "@/lib/media";
import { mongo } from "@/lib/mongo";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(req) && !(await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)))
    return NextResponse.json({ error: "Bejelentkezés szükséges." }, { status: 401 });
  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Érvénytelen id." }, { status: 400 });

  try {
    const doc = await (await mongo()).collection("posts").findOne({ _id: new ObjectId(id), status: { $ne: "archived" } });
    if (!doc) return NextResponse.json({ error: "Nincs ilyen poszt." }, { status: 404 });
    return NextResponse.json({ post: await toPost(doc, req.nextUrl.origin) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Nem sikerült betölteni a posztot." }, { status: 500 });
  }
}

// Ticks a plan item done/undone. Batch upserts never touch `done`, so a re-import keeps the ticks.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)))
    return NextResponse.json({ error: "Bejelentkezés szükséges." }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!ObjectId.isValid(id) || typeof body?.done !== "boolean")
    return NextResponse.json({ error: 'Kell: érvényes id és { "done": true | false }.' }, { status: 400 });

  try {
    const { matchedCount } = await (await mongo())
      .collection("posts")
      .updateOne({ _id: new ObjectId(id) }, { $set: { done: body.done, doneAt: body.done ? new Date() : null } });
    if (!matchedCount) return NextResponse.json({ error: "Nincs ilyen poszt." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Nem sikerült menteni." }, { status: 500 });
  }
}
