import { notFound } from "next/navigation";
import ProjectPosts from "@/components/ProjectPosts";
import { getProject, projects } from "@/lib/projects";

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((p) => ({ project: p.id }));
}

export default async function ProjectPage({ params }: PageProps<"/[project]">) {
  const project = getProject((await params).project);
  if (!project) notFound();

  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">{project.eyebrow}</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">{project.name}</h1>
      <p className="mt-2 text-muted">Marketing tervek, posztok és teendők ehhez a projekthez.</p>
      <ProjectPosts key={project.id} projectId={project.id} sections={project.sections} />
    </>
  );
}
