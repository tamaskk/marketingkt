import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authorized } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { ALLOWED_TYPES, MAX_SIZE, bucket, r2 } from "@/lib/r2";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (!authorized(req)) return fail("Hiányzó vagy hibás API kulcs.", 401);

  const body = await req.json().catch(() => null);
  const { projectId, filename, contentType, size } = body ?? {};

  if (!getProject(projectId)) return fail("Ismeretlen projekt.", 400);
  if (typeof filename !== "string" || !filename) return fail("Hiányzó fájlnév.", 400);
  if (!ALLOWED_TYPES.includes(contentType)) return fail("Csak kép vagy videó tölthető fel.", 415);
  if (!Number.isInteger(size) || size <= 0 || size > MAX_SIZE) return fail("A fájl legfeljebb 100 MB lehet.", 413);

  // Strip accents and anything outside [A-Za-z0-9_.-]; keep the tail (extension).
  const safeName = filename.normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(-100);
  const key = `${projectId}/${Date.now()}-${safeName}`;

  try {
    // ContentType and ContentLength are signed, so R2 rejects a PUT that differs from what was validated here.
    const url = await getSignedUrl(
      r2(),
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
      { expiresIn: 300, signableHeaders: new Set(["content-type"]) },
    );
    return NextResponse.json({ url, key });
  } catch (e) {
    console.error(e);
    return fail("Nem sikerült feltöltési URL-t kérni.", 500);
  }
}
