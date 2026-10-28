import { getProject, type Section } from "@/lib/projects";

export const PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "x", "threads", "reddit"];

export type MediaInput = { key: string; order: number; role?: "cover"; altText?: string };

export type PostInput = {
  externalId: string;
  section: Section;
  platforms: string[];
  status: "draft" | "scheduled" | "posted";
  scheduledAt: string;
  text: { caption: string; hashtags: string[]; cta?: string; firstComment?: string; title?: string };
  media: MediaInput[];
  tags: string[];
  notes?: string;
};

export type BatchInput = {
  batchId: string;
  projectId: string;
  source: { automationId: string; runId: string; model?: string; promptVersion?: string };
  replaceRange?: { from: string; to: string };
  posts: PostInput[];
};

export type Issue = { path: string; message: string };

const EXTERNAL_ID = /^[a-z0-9][a-z0-9:._-]{2,150}$/i;
// Offset is mandatory so the server never has to guess the time zone.
const OFFSET_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && LOCAL_DATE.test(v) && !Number.isNaN(Date.parse(v));

// All projects run on Budapest time; "sv-SE" formats as YYYY-MM-DD.
export const localDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });

const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const optStr = (v: unknown, max: number) => v === undefined || isStr(v, max);
const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 50 && v.every((x) => isStr(x, 100));

/* eslint-disable @typescript-eslint/no-explicit-any -- validating untrusted JSON */
export function validateBatch(body: any): { batch?: BatchInput; issues: Issue[] } {
  const issues: Issue[] = [];
  const bad = (path: string, message: string) => void issues.push({ path, message });
  if (!body || typeof body !== "object") return { issues: [{ path: "", message: "JSON objektum kell." }] };

  const project = getProject(body.projectId);
  if (!isStr(body.batchId, 200)) bad("batchId", "Kötelező szöveg, max. 200 karakter.");
  if (!project) bad("projectId", "Ismeretlen projekt.");
  if (!isStr(body.source?.automationId, 100)) bad("source.automationId", "Kötelező szöveg.");
  if (!isStr(body.source?.runId, 100)) bad("source.runId", "Kötelező szöveg.");
  if (!optStr(body.source?.model, 100)) bad("source.model", "Szöveg kell.");
  if (!optStr(body.source?.promptVersion, 100)) bad("source.promptVersion", "Szöveg kell.");
  const rr = body.replaceRange;
  if (rr !== undefined && (!isDate(rr?.from) || !isDate(rr?.to) || rr.from > rr.to))
    bad("replaceRange", '{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }, from <= to.');
  if (!Array.isArray(body.posts) || body.posts.length < 1 || body.posts.length > 200) {
    bad("posts", "1–200 poszt kell.");
    return { issues };
  }

  const seen = new Set<string>();
  body.posts.forEach((p: any, i: number) => {
    const at = (field: string) => `posts[${i}].${field}`;
    if (!p || typeof p !== "object") return bad(`posts[${i}]`, "Objektum kell.");

    if (typeof p.externalId !== "string" || !EXTERNAL_ID.test(p.externalId))
      bad(at("externalId"), "3–151 karakter: betű, szám, : . _ -");
    else if (seen.has(p.externalId)) bad(at("externalId"), "Ismétlődik a batchen belül.");
    else seen.add(p.externalId);

    if (project && !project.sections.includes(p.section)) bad(at("section"), `Engedélyezett: ${project.sections.join(", ")}.`);
    if (!Array.isArray(p.platforms) || !p.platforms.every((x: unknown) => PLATFORMS.includes(x as string)))
      bad(at("platforms"), `Tömb, elemei: ${PLATFORMS.join(", ")}.`);
    if (p.status !== undefined && !["draft", "scheduled", "posted"].includes(p.status)) bad(at("status"), "draft, scheduled vagy posted.");
    if (typeof p.scheduledAt !== "string" || !OFFSET_DATE.test(p.scheduledAt) || Number.isNaN(Date.parse(p.scheduledAt)))
      bad(at("scheduledAt"), 'ISO dátum időzónával, pl. "2026-11-03T18:00:00+01:00".');

    if (!isStr(p.text?.caption, 5000)) bad(at("text.caption"), "Kötelező szöveg, max. 5000 karakter.");
    if (p.text?.hashtags !== undefined && !strArr(p.text.hashtags)) bad(at("text.hashtags"), "Szövegtömb, max. 50 elem.");
    for (const f of ["cta", "firstComment", "title"]) if (!optStr(p.text?.[f], 2200)) bad(at(`text.${f}`), "Szöveg kell.");

    if (!Array.isArray(p.media) || p.media.length > 20) bad(at("media"), "Tömb, max. 20 elem.");
    else
      p.media.forEach((m: any, j: number) => {
        if (!isStr(m?.key, 300) || !m.key.startsWith(`${body.projectId}/`))
          bad(at(`media[${j}].key`), `R2 key "${body.projectId}/" előtaggal (az /api/upload adja).`);
        if (!Number.isInteger(m?.order)) bad(at(`media[${j}].order`), "Egész szám kell.");
        if (m?.role !== undefined && m.role !== "cover") bad(at(`media[${j}].role`), 'Csak "cover" lehet.');
        if (!optStr(m?.altText, 1000)) bad(at(`media[${j}].altText`), "Szöveg kell.");
      });

    if (p.tags !== undefined && !strArr(p.tags)) bad(at("tags"), "Szövegtömb, max. 50 elem.");
    if (!optStr(p.notes, 2000)) bad(at("notes"), "Szöveg kell.");
  });
  if (issues.length) return { issues };

  const { automationId, runId, model, promptVersion } = body.source;
  return {
    issues,
    batch: {
      batchId: body.batchId,
      projectId: body.projectId,
      source: { automationId, runId, model, promptVersion },
      replaceRange: rr && { from: rr.from, to: rr.to },
      posts: body.posts.map((p: any) => ({
        externalId: p.externalId,
        section: p.section,
        platforms: p.platforms,
        status: p.status ?? "scheduled",
        scheduledAt: p.scheduledAt,
        text: {
          caption: p.text.caption,
          hashtags: (p.text.hashtags ?? []).map((h: string) => h.trim().replace(/^#/, "")),
          cta: p.text.cta,
          firstComment: p.text.firstComment,
          title: p.text.title,
        },
        media: [...p.media]
          .sort((a, b) => a.order - b.order)
          .map(({ key, order, role, altText }) => ({ key, order, role, altText })),
        tags: p.tags ?? [],
        notes: p.notes,
      })),
    },
  };
}
