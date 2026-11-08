import { NextResponse, type NextRequest } from "next/server";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ASSET_ID } from "@/lib/media";
import { mongo } from "@/lib/mongo";
import { bucket, r2 } from "@/lib/r2";

const LIMIT = 60;
const POSTED_TTL = 30 * 24 * 60 * 60 * 1000;
// shortcut: per-instance memory, so each serverless instance counts separately; move to Redis/KV if abuse shows up.
const hits = new Map<string, { count: number; reset: number }>();

function limited(ip: string) {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset < now) return void hits.set(ip, { count: 1, reset: now + 60_000 });
  return ++h.count > LIMIT;
}

const notFound = () => new NextResponse("Not found", { status: 404 });

// Public media link: redirects to a 1-hour presigned R2 URL, so the bucket itself stays private.
// R2 then serves Content-Type, Content-Length and Range (206) itself.
async function handle(req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  if (limited(req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"))
    return new NextResponse("Too many requests", { status: 429, headers: { "Retry-After": "60" } });
  const { assetId } = await params;
  if (!ASSET_ID.test(assetId)) return notFound();

  try {
    // Only assets of live posts; a posted one stays reachable for 30 days after its last update.
    const post = await (await mongo()).collection("posts").findOne(
      {
        "media.assetId": assetId,
        $or: [{ status: { $nin: ["archived", "posted"] } }, { status: "posted", updatedAt: { $gte: new Date(Date.now() - POSTED_TTL) } }],
      },
      { projection: { media: 1 } },
    );
    const key = post?.media.find((m: { assetId?: string }) => m.assetId === assetId)?.key;
    if (!key) return notFound();

    // A HEAD must follow to a HEAD-signed URL: the signature covers the method.
    const Command = req.method === "HEAD" ? HeadObjectCommand : GetObjectCommand;
    const url = await getSignedUrl(r2(), new Command({ Bucket: bucket(), Key: key }), { expiresIn: 3600 });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return new NextResponse("Server error", { status: 500 });
  }
}

export { handle as GET, handle as HEAD };
