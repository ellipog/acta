export const SLUG_MIN = 3;
export const SLUG_MAX = 32;
// Where the app lives. Change it here when Acta moves to its own domain
export const siteHost = "acta.aaenz.no";
export const siteUrl = `https://${siteHost}`;

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

/** A free address for a new board, given the ones its workspace already uses */
export function boardSlugFor(name: string, taken: Iterable<string>) {
  let base = slugify(name).replace(/-+$/, "");
  if (boardSlugProblem(base)) base = `${base || "board"}-board`.slice(0, 28).replace(/-+$/, "");
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** The letters a board's task ids start with */
export const boardPrefixFor = (name: string) => {
  const x = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]/.test(x) ? x.slice(0, 3) : "ACT";
};

const publicOrigin = process.env.NEXT_PUBLIC_PUBLIC_ORIGIN?.replace(/\/+$/, "");
// A roadmap domain serves /<workspace>/<board> through src/proxy.ts. Without one, roadmaps live under /p
export const publicHost = publicOrigin ? new URL(publicOrigin).hostname : null;

export const publicPath = (workspace: string, board?: string) =>
  `${publicHost ?? `${siteHost}/p`}/${workspace}${board ? `/${board}` : ""}`;

export const publicHref = (workspace: string, board: string) =>
  publicOrigin ? `${publicOrigin}/${workspace}/${board}` : `/p/${workspace}/${board}`;

export const actaRoadmapHref = publicHref("aaen-studios", "acta");
