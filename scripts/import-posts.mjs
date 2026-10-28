// Uploads an existing post pack: local files → R2 via /api/upload, then the posts via /api/posts/batch.
// Usage: node --env-file=.env.local scripts/import-posts.mjs <manifest.json> [baseUrl]
// The manifest is a normal batch, except media items carry "file": "/abs/path" instead of "key".
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const [manifestPath, base = "http://localhost:3000"] = process.argv.slice(2);
if (!manifestPath) throw new Error("Használat: node --env-file=.env.local scripts/import-posts.mjs <manifest.json> [baseUrl]");
const auth = { Authorization: `Bearer ${process.env.UPLOAD_API_KEY}` };

const TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};
const MAX_SIZE = 100 * 1024 * 1024;

const batch = JSON.parse(await readFile(manifestPath, "utf8"));
const files = [...new Set(batch.posts.flatMap((p) => p.media.filter((m) => m.file).map((m) => m.file)))];

// Check every file before uploading anything, so a typo doesn't leave half a pack in R2.
const problems = [];
for (const file of files) {
  const size = await stat(file).then((s) => s.size, () => null);
  if (size === null) problems.push(`nem létezik: ${file}`);
  else if (size > MAX_SIZE) problems.push(`100 MB fölött: ${file}`);
  if (!TYPES[path.extname(file).toLowerCase()]) problems.push(`nem támogatott típus: ${file}`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

async function upload(file) {
  const contentType = TYPES[path.extname(file).toLowerCase()];
  const body = await readFile(file);
  const res = await fetch(`${base}/api/upload`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: batch.projectId, filename: path.basename(file), contentType, size: body.length }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${file}: ${data.error}`);
  const put = await fetch(data.url, { method: "PUT", headers: { "Content-Type": contentType }, body });
  if (!put.ok) throw new Error(`${file}: PUT ${put.status}`);
  return data.key;
}

// shortcut: re-running uploads the files again (new keys, old ones orphaned); fine for a one-off import.
const keys = new Map();
for (const [i, file] of files.entries()) {
  keys.set(file, await upload(file));
  console.log(`[${i + 1}/${files.length}] feltöltve: ${path.basename(file)}`);
}
for (const p of batch.posts) p.media = p.media.map(({ file, ...m }) => (file ? { ...m, key: keys.get(file) } : m));

const res = await fetch(`${base}/api/posts/batch`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify(batch),
});
const result = await res.json();
console.log(res.status, JSON.stringify(result, null, 2));
if (!res.ok) process.exit(1);
