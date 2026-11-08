import "server-only";
import { randomBytes } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Document, WithId } from "mongodb";
import { bucket, r2 } from "@/lib/r2";

// 128 random bits in the R2 key ("<projectId>/<assetId>-<name>") make /m/<assetId> unguessable.
export const ASSET_ID = /^[0-9a-f]{32}$/;
export const newAssetId = () => randomBytes(16).toString("hex");
// Keys uploaded before asset ids existed ("<projectId>/<timestamp>-<name>") get none, so no public link.
export const assetIdOf = (key: string) => key.match(/^[^/]+\/([0-9a-f]{32})-/)?.[1];
export const publicUrl = (origin: string, assetId: string | undefined) => (assetId ? `${origin}/m/${assetId}` : null);

// `attachment` makes the browser save the file; a cross-origin <a download> would be ignored.
export const sign = (key: string, download = false) =>
  getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: download
        ? `attachment; filename="${key.split("/").pop()!.replace(/^(\d+|[0-9a-f]{32})-/, "").replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn: 3600 },
  );

type Media = { key: string; kind: string; role?: string; altText?: string; assetId?: string };

export const toPost = async (d: WithId<Document>, origin: string) => ({
  id: String(d._id),
  projectId: d.projectId,
  externalId: d.externalId,
  section: d.section,
  platforms: d.platforms,
  status: d.status,
  done: !!d.done,
  scheduledAt: d.scheduledAt,
  text: d.text,
  tags: d.tags,
  notes: d.notes,
  // Bucket is private: previews go through short-lived signed GET URLs, external services through /m/<assetId>.
  media: await Promise.all(
    d.media.map(async (m: Media) => ({
      kind: m.kind,
      role: m.role,
      altText: m.altText,
      url: await sign(m.key),
      downloadUrl: await sign(m.key, true),
      publicUrl: publicUrl(origin, m.assetId ?? assetIdOf(m.key)),
    })),
  ),
});
