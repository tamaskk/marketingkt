"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LAST_PROJECT_KEY, getProject, projects } from "@/lib/projects";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_PROJECT_KEY);
    } catch {}
    router.replace(`/${getProject(last)?.id ?? projects[0].id}`);
  }, [router]);

  return null;
}
