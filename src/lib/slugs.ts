export const SLUG_MIN = 3;
export const SLUG_MAX = 32;
export const publicHost = "acta.page";

const reserved = new Set([
  "about",
  "account",
  "acta",
  "actapage",
  "admin",
  "administrator",
  "api",
  "app",
  "apps",
  "assets",
  "auth",
  "billing",
  "blog",
  "cdn",
  "changelog",
  "contact",
  "dashboard",
  "demo",
  "docs",
  "download",
  "email",
  "enterprise",
  "explore",
  "help",
  "home",
  "invite",
  "join",
  "legal",
  "library",
  "log-in",
  "login",
  "logout",
  "mail",
  "moderator",
  "new",
  "oauth",
  "official",
  "pricing",
  "privacy",
  "roadmap",
  "root",
  "scim",
  "search",
  "security",
  "settings",
  "sign-in",
  "sign-up",
  "signin",
  "signout",
  "signup",
  "sso",
  "staff",
  "static",
  "status",
  "support",
  "system",
  "terms",
  "www",
]);

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX);
}

function shapeProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `At least ${SLUG_MIN} characters.`;
  if (slug.endsWith("-")) return "It can’t end with a hyphen.";
  return null;
}

export function slugProblem(slug: string): string | null {
  return shapeProblem(slug) ?? (reserved.has(slug) ? "That name is reserved." : null);
}

// Boards sit under a workspace, so only the workspace's own routes are off limits
export function boardSlugProblem(slug: string): string | null {
  return shapeProblem(slug) ?? (slug === "settings" ? "That name is reserved." : null);
}

export const publicPath = (workspace: string, board?: string) =>
  `${publicHost}/${workspace}${board ? `/${board}` : ""}`;

const publicOrigin = process.env.NEXT_PUBLIC_PUBLIC_ORIGIN?.replace(/\/+$/, "");

export const publicHref = (workspace: string, board: string) =>
  publicOrigin ? `${publicOrigin}/${workspace}/${board}` : `/p/${workspace}/${board}`;

export const actaRoadmapHref = publicHref("aaen-studios", "acta");
