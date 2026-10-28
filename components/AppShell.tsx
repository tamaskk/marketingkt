"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { LAST_PROJECT_KEY, getProject, projects } from "@/lib/projects";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = getProject(pathname.split("/")[1]);
  const accent = (active ?? projects[0]).accent;

  useEffect(() => {
    if (!active) return;
    try {
      localStorage.setItem(LAST_PROJECT_KEY, active.id);
    } catch {}
    document.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  if (pathname === "/login") return <main className="px-4">{children}</main>;

  return (
    <div className="shell min-h-dvh" style={{ "--accent-light": accent.light, "--accent-dark": accent.dark } as CSSProperties}>
      <main className="mx-auto w-full max-w-[560px] px-4 pt-10 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+24px)]">
        {children}
      </main>

      <nav aria-label="Projektek" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        {/* Equal widths up to ~5 tabs; beyond that the bar scrolls horizontally instead of the page. */}
        <ul className="mx-auto flex max-w-[560px] overflow-x-auto">
          {projects.map((p) => {
            const isActive = p.id === active?.id;
            return (
              <li key={p.id} className="min-w-[72px] flex-1">
                <Link
                  href={`/${p.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex h-[var(--tabbar-h)] flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold ${isActive ? "text-accent" : "text-muted"}`}
                >
                  <p.icon width={24} height={24} aria-hidden />
                  <span className="max-w-full truncate px-1">{p.tab}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
