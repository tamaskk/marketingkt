import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { authorized } from "@/lib/auth";
import { mongo } from "@/lib/mongo";
import { localDate, validateBatch, type Issue } from "@/lib/posts";
import { bucket, r2 } from "@/lib/r2";

type BatchResponse = {
  batchId: string;
  replayed: boolean;
  items: { externalId: string; result: "created" | "updated"; postId: string }[];
  archived: { externalId: string; postId: string }[];
};
type BatchDoc = { _id: string; requestHash: string; response: BatchResponse; createdAt: Date };

const fail = (status: number, error: string, message: string, issues?: Issue[]) =>
  NextResponse.json({ error, message, issues }, { status });

async function head(key: string) {
  try {
    return await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (e) {
    if ((e as Error).name === "NotFound") return null;
    throw e;
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) return fail(401, "UNAUTHORIZED", "Hiányzó vagy hibás API kulcs.");

  const raw = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "BAD_JSON", "Hibás JSON.");
  }

  const { batch, issues } = validateBatch(body);
  if (!batch) return fail(422, "VALIDATION_FAILED", "Hibás batch, semmi nem mentődött.", issues);

  try {
    const db = await mongo();
    const batches = db.collection<BatchDoc>("batches");

    // Same batchId + same body = network retry: answer from the stored result, write nothing.
    const requestHash = createHash("sha256").update(raw).digest("hex");
    const prev = await batches.findOne({ _id: batch.batchId });
    if (prev) {
      return prev.requestHash === requestHash
        ? NextResponse.json({ ...prev.response, replayed: true })
        : fail(409, "BATCH_ID_REUSED", "Ez a batchId már más tartalommal lefutott. Új runId kell.");
    }

    // Files are uploaded first, so every media key must already exist in R2.
    const keys = [...new Set(batch.posts.flatMap((p) => p.media.map((m) => m.key)))];
    const heads = new Map(await Promise.all(keys.map(async (k) => [k, await head(k)] as const)));

    const mediaIssues: Issue[] = [];
    const posts = batch.posts.map((p, i) => {
      const media = p.media.map((m, j) => {
        const h = heads.get(m.key);
        if (!h) mediaIssues.push({ path: `posts[${i}].media[${j}].key`, message: "Nincs ilyen fájl az R2-ben." });
        const mimeType = h?.ContentType ?? "";
        return { ...m, kind: mimeType.startsWith("video/") ? "video" : "image", mimeType, sizeBytes: h?.ContentLength };
      });
      const main = media.filter((m) => m.role !== "cover");
      if (p.section === "kep" && !main.some((m) => m.kind === "image"))
        mediaIssues.push({ path: `posts[${i}].media`, message: "Kép szekcióhoz legalább 1 kép kell." });
      if (p.section === "video" && !main.some((m) => m.kind === "video"))
        mediaIssues.push({ path: `posts[${i}].media`, message: "Videó szekcióhoz legalább 1 videó kell." });
      const scheduledAt = new Date(p.scheduledAt);
      return { ...p, media, scheduledAt, localDate: localDate(scheduledAt) };
    });
    if (mediaIssues.length) return fail(422, "MEDIA_INVALID", "Hibás média, semmi nem mentődött.", mediaIssues);

    // Upsert on (projectId, externalId): a re-run generating the same post updates it instead of duplicating.
    const col = db.collection("posts");
    const now = new Date();
    const res = await col.bulkWrite(
      posts.map((p) => ({
        updateOne: {
          filter: { projectId: batch.projectId, externalId: p.externalId },
          update: {
            $set: { ...p, projectId: batch.projectId, source: { ...batch.source, batchId: batch.batchId }, updatedAt: now },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const ids = new Map(
      (await col
        .find({ projectId: batch.projectId, externalId: { $in: posts.map((p) => p.externalId) } }, { projection: { externalId: 1 } })
        .toArray()).map((d) => [d.externalId as string, String(d._id)]),
    );
    // Regenerating a pack: this automation's other posts in the range are archived (soft delete), never others' posts.
    const archived: BatchResponse["archived"] = [];
    if (batch.replaceRange) {
      const stale = {
        projectId: batch.projectId,
        "source.automationId": batch.source.automationId,
        localDate: { $gte: batch.replaceRange.from, $lte: batch.replaceRange.to },
        externalId: { $nin: posts.map((p) => p.externalId) },
        status: { $in: ["draft", "scheduled"] },
      };
      for (const d of await col.find(stale, { projection: { externalId: 1 } }).toArray())
        archived.push({ externalId: d.externalId, postId: String(d._id) });
      await col.updateMany(stale, { $set: { status: "archived", updatedAt: now } });
    }

    const response: BatchResponse = {
      batchId: batch.batchId,
      replayed: false,
      items: posts.map((p, i) => ({
        externalId: p.externalId,
        result: res.upsertedIds[i] ? "created" : "updated",
        postId: ids.get(p.externalId)!,
      })),
      archived,
    };

    // A parallel duplicate may have stored it first; its upserts were identical, so ignore the conflict.
    await batches.insertOne({ _id: batch.batchId, requestHash, response, createdAt: now }).catch((e) => {
      if (e.code !== 11000) throw e;
    });
    return NextResponse.json(response, { status: 201 });
  } catch (e) {
    console.error(e);
    return fail(500, "INTERNAL", "Szerverhiba. Próbáld újra ugyanazzal a batchId-val.");
  }
}
