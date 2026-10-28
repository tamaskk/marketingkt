import type { ComponentType, SVGProps } from "react";
import { MapPin, Music } from "lucide-react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const SECTION_LABELS = { kep: "Kép", video: "Videó", social: "Social", terv: "Terv", linkedin: "LinkedIn", reddit: "Reddit" };
export type Section = keyof typeof SECTION_LABELS;

export type Project = {
  id: string;
  name: string;
  tab: string;
  eyebrow: string;
  accent: { light: string; dark: string };
  icon: Icon;
  sections: Section[];
};

const stroke = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function SoccerBall(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...stroke} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7.5l4.3 3.1-1.6 5h-5.4l-1.6-5z" />
      <path d="M12 7.5V2M16.3 10.6l5.2-1.7M14.7 15.6l3.2 4.5M9.3 15.6l-3.2 4.5M7.7 10.6L2.5 8.9" />
    </svg>
  );
}

function LinkedInSquare(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...stroke} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 10.5V17M8 7.5v.01M12 17v-6.5M12 13.5a2.5 2.5 0 0 1 5 0V17" />
    </svg>
  );
}

// Új projekt = új sor ebben a tömbben.
export const projects: Project[] = [
  { id: "spinvincible", name: "Spinvincible", tab: "Spinvincible", eyebrow: "Projekt", accent: { light: "#e0452b", dark: "#ff6a4f" }, icon: SoccerBall, sections: ["kep", "video", "social"] },
  { id: "kt", name: "KT", tab: "KT (DJ)", eyebrow: "DJ", accent: { light: "#7b3fe4", dark: "#a57bff" }, icon: Music, sections: ["kep", "video", "social", "reddit"] },
  { id: "linkedin", name: "LinkedIn", tab: "LinkedIn", eyebrow: "Személyes brand", accent: { light: "#0a66c2", dark: "#4aa3ff" }, icon: LinkedInSquare, sections: ["linkedin", "reddit"] },
  { id: "kiholma", name: "KiHolMa", tab: "KiHolMa", eyebrow: "Projekt", accent: { light: "#13916b", dark: "#34c494" }, icon: MapPin, sections: ["kep", "video", "social", "terv"] },
];

export const getProject = (id: string | null | undefined) => projects.find((p) => p.id === id);

export const LAST_PROJECT_KEY = "mh:lastProject";
