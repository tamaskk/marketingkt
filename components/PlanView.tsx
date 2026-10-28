"use client";

import { useMemo, useState } from "react";

export type PlanItem = {
  id: string;
  scheduledAt: string;
  done: boolean;
  text: { caption: string; title?: string };
  tags?: string[];
  notes?: string;
};

const tag = (item: PlanItem, prefix: string) => item.tags?.find((t) => t.startsWith(`${prefix}:`))?.slice(prefix.length + 1);
const tz = { timeZone: "Europe/Budapest" } as const;
const day = new Intl.DateTimeFormat("sv-SE", tz); // YYYY-MM-DD
const weekday = new Intl.DateTimeFormat("hu-HU", { ...tz, weekday: "long" });
const clock = new Intl.DateTimeFormat("hu-HU", { ...tz, hour: "2-digit", minute: "2-digit" });

// Plan view: channel filter, "only remaining" toggle, week groups with progress, tickable items with details.
export default function PlanView({ items, onToggle }: { items: PlanItem[]; onToggle: (id: string, done: boolean) => void }) {
  const [channel, setChannel] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const today = day.format(new Date());

  const channels = useMemo(
    () => [...new Set(items.map((i) => tag(i, "csatorna")).filter((c): c is string => !!c && c !== "–"))].sort((a, b) => a.localeCompare(b, "hu")),
    [items],
  );

  const visible = items.filter((i) => (!channel || tag(i, "csatorna") === channel) && (!onlyOpen || !i.done));
  const weeks = new Map<string, PlanItem[]>();
  for (const i of visible) {
    const w = tag(i, "het") ?? "Egyéb";
    weeks.set(w, [...(weeks.get(w) ?? []), i]);
  }
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="mt-4">
      <Progress done={doneCount} total={items.length} />

      <div className="mt-4 flex flex-wrap gap-2">
        {[null, ...channels].map((c) => (
          <button
            key={c ?? "mind"}
            type="button"
            aria-pressed={channel === c}
            onClick={() => setChannel(c)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${channel === c ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted"}`}
          >
            {c ?? "Mind"}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="size-4 accent-[var(--accent)]" />
        Csak a hátralévők
      </label>

      {visible.length === 0 && <p className="mt-6 text-center text-muted">Nincs ilyen tétel.</p>}

      {[...weeks].map(([week, list]) => {
        const open = list.filter((i) => !i.done);
        const minutes = open.reduce((sum, i) => sum + (Number(tag(i, "perc")) || 0), 0);
        return (
          <section key={week} className="mt-8">
            <h2 className="font-display text-2xl font-extrabold">{week === "Egyéb" ? week : `${week.replace("-", "–")}. hét`}</h2>
            <p className="mt-1 text-sm text-muted">
              {list.length - open.length} / {list.length} kész{minutes > 0 && ` · hátra kb. ${minutes} perc`}
            </p>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {list.map((i) => (
                <PlanRow key={i.id} item={i} overdue={!i.done && day.format(new Date(i.scheduledAt)) < today} onToggle={onToggle} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-sm font-semibold">
        {done} / {total} kész ({pct}%)
      </span>
    </div>
  );
}

function PlanRow({ item, overdue, onToggle }: { item: PlanItem; overdue: boolean; onToggle: (id: string, done: boolean) => void }) {
  const date = new Date(item.scheduledAt);
  const [md, type, minutes, time] = [day.format(date).slice(5), tag(item, "tipus"), tag(item, "perc"), tag(item, "ido")];
  const channel = tag(item, "csatorna") ?? item.text.title;

  return (
    <li className={`flex gap-3 border-l-4 p-3 ${overdue ? "border-l-red-500" : "border-l-transparent"} ${item.done ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        aria-label={`Kész: ${item.text.caption.slice(0, 60)}`}
        className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-bold">{md}</span>
          <span className="text-muted">
            {weekday.format(date)} · {time || clock.format(date)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-semibold">
          {channel && <span className="rounded-full bg-fg px-2 py-0.5 text-bg">{channel}</span>}
          {type && <span className="rounded-full bg-line px-2 py-0.5">{type}</span>}
          {minutes && <span className="rounded-full bg-line px-2 py-0.5">{minutes} perc</span>}
        </div>
        <p className={`mt-1.5 break-words ${item.done ? "line-through" : ""}`}>{item.text.caption}</p>
        {item.notes && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-sm font-semibold text-muted">Részletek</summary>
            <p className="mt-2 whitespace-pre-line break-words text-sm text-muted">{item.notes}</p>
          </details>
        )}
      </div>
    </li>
  );
}
