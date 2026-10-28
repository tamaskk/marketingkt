import { NextResponse, type NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { WithId, Document } from "mongodb";
import { mongo } from "@/lib/mongo";
import { getProject } from "@/lib/projects";
import { bucket, r2 } from "@/lib/r2";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

// `attachment` makes the browser save the file; a cross-origin <a download> would be ignored.
const sign = (key: string, download = false) =>
  getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: download
        ? `attachment; filename="${key.split("/").pop()!.replace(/^\d+-/, "").replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn: 3600 },
  );

export async function GET(req: NextRequest) {
  if (!(await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)))
    return NextResponse.json({ error: "Bejelentkezés szükséges." }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get("project");
  if (!getProject(projectId)) return NextResponse.json({ error: "Ismeretlen projekt." }, { status: 400 });

  try {
    // shortcut: max 500 posts, no paging; add a cursor when a project outgrows it.
    const docs = await (await mongo()).collection("posts").find({ projectId, status: { $ne: "archived" } }).sort({ scheduledAt: 1 }).limit(500).toArray();

    const posts = await Promise.all(
      docs.map(async (d: WithId<Document>) => ({
        id: String(d._id),
        externalId: d.externalId,
        section: d.section,
        platforms: d.platforms,
        status: d.status,
        done: !!d.done,
        scheduledAt: d.scheduledAt,
        text: d.text,
        tags: d.tags,
        notes: d.notes,
        // Bucket is private: previews go through short-lived signed GET URLs.
        media: await Promise.all(
          d.media.map(async (m: { key: string; kind: string; role?: string; altText?: string }) => ({
            kind: m.kind,
            role: m.role,
            altText: m.altText,
            url: await sign(m.key),
            downloadUrl: await sign(m.key, true),
          })),
        ),
      })),
    );
    return NextResponse.json({ posts });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Nem sikerült betölteni a posztokat." }, { status: 500 });
  }
}
