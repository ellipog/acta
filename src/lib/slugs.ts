export const SLUG_MIN = 3;
export const SLUG_MAX = 32;
export const publicHost = "acta.page";

const reserved = new Set([
  "about",
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

export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `At least ${SLUG_MIN} characters.`;
  if (slug.endsWith("-")) return "It can’t end with a hyphen.";
  if (reserved.has(slug)) return "That name is reserved.";
  return null;
}

export const publicPath = (workspace: string, board?: string) =>
  `${publicHost}/${workspace}${board ? `/${board}` : ""}`;
