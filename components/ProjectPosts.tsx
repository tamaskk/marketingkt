"use client";

import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import PlanView from "@/components/PlanView";
import { SECTION_LABELS, type Section } from "@/lib/projects";

type Media = { kind: "image" | "video"; role?: "cover"; altText?: string; url: string; downloadUrl: string };
type Post = {
  id: string;
  section: Section;
  platforms: string[];
  status: "draft" | "scheduled" | "posted";
  done: boolean;
  tags?: string[];
  scheduledAt: string;
  text: { caption: string; hashtags: string[]; cta?: string; firstComment?: string; title?: string };
  media: Media[];
  notes?: string;
};

const dateFmt = new Intl.DateTimeFormat("hu-HU", {
  month: "short",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Budapest",
});

const dayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }); // YYYY-MM-DD

// Today and upcoming first (soonest on top), then the past (most recent first).
function byToday(list: Post[], today: string) {
  const upcoming = list.filter((p) => dayKey.format(new Date(p.scheduledAt)) >= today);
  const past = list.filter((p) => dayKey.format(new Date(p.scheduledAt)) < today).reverse();
  return [...upcoming, ...past];
}

async function fetchPosts(projectId: string): Promise<Post[]> {
  const res = await fetch(`/api/posts?project=${projectId}`).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) throw new Error(data?.error ?? "Nem sikerült betölteni a posztokat.");
  return data.posts;
}

// Read-only: posts are created by automations through /api/posts/batch.
export default function ProjectPosts({ projectId, sections }: { projectId: string; sections: Section[] }) {
  const [section, setSection] = useState(sections[0]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-viewer preference, remembered per project. Only rendered after posts load, so SSR never sees it.
  const doneLastKey = `mh:doneLast:${projectId}`;
  const [doneLast, setDoneLast] = useState(() => {
    try {
      return localStorage.getItem(doneLastKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    fetchPosts(projectId).then(setPosts, (e: Error) => {
      setError(e.message);
      setPosts([]);
    });
  }, [projectId]);

  const tickable = section === "kep" || section === "video";
  const today = dayKey.format(new Date());
  const filtered = posts?.filter((p) => p.section === section);
  const ordered = filtered && section !== "terv" ? byToday(filtered, today) : filtered;
  // sort is stable, so the today-first order is kept inside the open and the done group.
  const shown = tickable && doneLast ? ordered?.toSorted((a, b) => Number(a.done) - Number(b.done)) : ordered;
  const firstPast = shown?.findIndex((p) => dayKey.format(new Date(p.scheduledAt)) < today && !(tickable && doneLast && p.done));

  function switchDoneLast() {
    setDoneLast(!doneLast);
    try {
      localStorage.setItem(doneLastKey, doneLast ? "0" : "1");
    } catch {}
  }

  // Optimistic tick; rolled back if the save fails.
  async function toggle(id: string, done: boolean) {
    const set = (value: boolean) => setPosts((list) => list?.map((p) => (p.id === id ? { ...p, done: value } : p)) ?? null);
    set(done);
    const res = await fetch(`/api/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    }).catch(() => null);
    if (!res?.ok) {
      set(!done);
      setError("Nem sikerült menteni a pipát.");
    }
  }

  return (
    <section className="mt-6">
      <div className="flex gap-2">
        {sections.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === section}
            onClick={() => setSection(s)}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${s === section ? "border-accent bg-accent text-surface" : "border-line bg-surface text-muted"}`}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-muted">{error}</p>}

      {tickable && !!shown?.length && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">
            {shown.filter((p) => p.done).length} / {shown.length} kész
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={doneLast}
            onClick={switchDoneLast}
            className="flex items-center gap-2 font-semibold"
          >
            Kész alulra
            <span className={`relative h-6 w-10 rounded-full transition-colors ${doneLast ? "bg-accent" : "bg-line"}`}>
              <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow transition-transform ${doneLast ? "translate-x-4" : ""}`} />
            </span>
          </button>
        </div>
      )}

      {shown?.length === 0 && (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-line p-8 text-center">
          <p className="font-display text-lg font-extrabold">Még nincs tartalom</p>
          <p className="mt-1 text-muted">Hamarosan jön ide.</p>
        </div>
      )}

      {section === "terv" && !!shown?.length && <PlanView items={shown} onToggle={toggle} />}

      {section !== "terv" && !!shown?.length && (
        <ul className="mt-4 space-y-4">
          {shown.map((p, i) => (
            <Fragment key={p.id}>
              {i === firstPast && i > 0 && (
                <li aria-hidden className="flex items-center gap-3 pt-2 text-xs font-bold uppercase tracking-wider text-muted">
                  <span className="h-px flex-1 bg-line" />
                  Korábbiak
                  <span className="h-px flex-1 bg-line" />
                </li>
              )}
              <PostCard post={p} isToday={dayKey.format(new Date(p.scheduledAt)) === today} onToggle={tickable ? toggle : undefined} />
            </Fragment>
          ))}
        </ul>
      )}
    </section>
  );
}

function PostCard({ post, isToday, onToggle }: { post: Post; isToday: boolean; onToggle?: (id: string, done: boolean) => void }) {
  const main = post.media.filter((m) => m.role !== "cover");
  const cover = post.media.find((m) => m.role === "cover");
  const [copied, setCopied] = useState<boolean | null>(null);
  const subreddit = post.tags?.find((t) => t.startsWith("sub:r/"))?.slice(4); // "r/SideProject"
  const fullText = [post.text.caption, post.text.cta, post.text.hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
  // Prefilled composer: Reddit takes title + text (media is attached by hand), LinkedIn takes the text.
  const compose = subreddit
    ? {
        label: `Posztolás: ${subreddit}`,
        href: `https://www.reddit.com/${subreddit}/submit?${new URLSearchParams({
          type: post.media.length ? "IMAGE" : "TEXT",
          title: post.text.title ?? "",
          text: fullText,
        })}`,
      }
    : post.platforms.includes("linkedin")
      ? { label: "Posztolás LinkedInen", href: `https://www.linkedin.com/feed/?${new URLSearchParams({ shareActive: "true", text: fullText })}` }
      : null;

  // The full text as it goes out: caption, CTA, then hashtags.
  async function copyText() {
    const ok = await navigator.clipboard?.writeText(fullText).then(() => true, () => false);
    setCopied(!!ok);
    setTimeout(() => setCopied(null), 2000);
  }

  // One click saves every file of the post (carousel slides, video + cover).
  async function download() {
    for (const m of post.media) {
      const a = document.createElement("a");
      a.href = m.downloadUrl;
      a.click();
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return (
    <li className={`rounded-2xl border bg-surface p-4 ${isToday ? "border-accent" : "border-line"} ${post.done && onToggle ? "opacity-60" : ""}`}>
      {onToggle && (
        <label className="mb-3 flex w-fit items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={post.done}
            onChange={(e) => onToggle(post.id, e.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          Kész
        </label>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <time dateTime={post.scheduledAt} className="font-semibold">
          {isToday && <span className="mr-2 rounded-full bg-accent px-2 py-0.5 font-bold text-surface">MA</span>}
          {dateFmt.format(new Date(post.scheduledAt))}
        </time>
        <span>
          {{ draft: "Vázlat", scheduled: "Ütemezve", posted: "Posztolva" }[post.status]}
          {post.platforms.length > 0 && ` · ${post.platforms.join(", ")}`}
          {subreddit && <span className="ml-2 rounded-full bg-line px-2 py-0.5 font-bold text-fg">{subreddit}</span>}
        </span>
      </div>

      {main.length > 0 && (
        <div className="-mx-4 mt-3 flex snap-x gap-2 overflow-x-auto px-4">
          {main.map((m) => (
            <a
              key={m.url}
              href={m.url}
              target="_blank"
              rel="noreferrer"
              className={`block shrink-0 snap-start overflow-hidden rounded-xl bg-line ${main.length > 1 ? "w-2/3" : "w-full"}`}
            >
              {m.kind === "video" ? (
                <video src={m.url} poster={cover?.url} preload="metadata" muted playsInline controls className="aspect-[4/5] w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- signed R2 URLs, no optimizer needed
                <img src={m.url} alt={m.altText ?? ""} loading="lazy" className="aspect-[4/5] w-full object-cover" />
              )}
            </a>
          ))}
        </div>
      )}

      {post.text.title && <p className="mt-3 font-display text-lg font-extrabold">{post.text.title}</p>}
      <p className="mt-2 whitespace-pre-line break-words">{post.text.caption}</p>
      {post.text.cta && <p className="mt-2 text-sm font-semibold">{post.text.cta}</p>}
      {post.text.hashtags.length > 0 && (
        <p className="mt-2 break-words text-sm text-accent">{post.text.hashtags.map((h) => `#${h}`).join(" ")}</p>
      )}
      {post.text.firstComment && <p className="mt-2 text-sm text-muted">1. komment: {post.text.firstComment}</p>}
      {post.notes && <p className="mt-2 text-xs text-muted">Megjegyzés: {post.notes}</p>}

      <div className="mt-4 flex gap-2">
        {post.media.length > 0 && (
          <button type="button" onClick={download} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold">
            <Download width={18} height={18} aria-hidden />
            Letöltés{post.media.length > 1 && ` (${post.media.length})`}
          </button>
        )}
        <button type="button" onClick={copyText} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold">
          {copied ? <Check width={18} height={18} aria-hidden /> : <Copy width={18} height={18} aria-hidden />}
          <span aria-live="polite">{copied === null ? "Szöveg másolása" : copied ? "Másolva" : "Nem sikerült"}</span>
        </button>
      </div>
      {compose && (
        <>
          <a
            href={compose.href}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-surface"
          >
            <ExternalLink width={18} height={18} aria-hidden />
            {compose.label}
          </a>
          {subreddit && post.media.length > 0 && (
            <p className="mt-1 text-center text-xs text-muted">A képet/videót a Letöltés után csatold a posztolásnál.</p>
          )}
        </>
      )}
    </li>
  );
}
