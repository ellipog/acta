// GitHub links in descriptions and comments, read for what they point at, so they can show as short chips like
// calcite#45 or calcite@1f3fcdc rather than long addresses

export type GitHubRef = {
  kind: "commit" | "pull" | "issue" | "branch" | "file" | "compare" | "release" | "repo" | "user";
  label: string;
};

const sha = /^[0-9a-f]{7,40}$/i;

/** What a github.com address points at, or null for anything else */
export function githubRef(href: string): GitHubRef | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const [owner, repo, kind, ...rest] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!owner) return null;
  if (!repo) return { kind: "user", label: `@${owner}` };
  const n = rest[0];
  const line = /^#L(\d+)/.exec(url.hash)?.[1];
  switch (kind) {
    case undefined:
      return { kind: "repo", label: `${owner}/${repo}` };
    case "commit":
      return n && sha.test(n) ? { kind: "commit", label: `${repo}@${n.slice(0, 7)}` } : null;
    case "pull":
      return n && /^\d+$/.test(n) ? { kind: "pull", label: `${repo}#${n}` } : null;
    case "issues":
      return n && /^\d+$/.test(n) ? { kind: "issue", label: `${repo}#${n}` } : { kind: "repo", label: `${repo} issues` };
    case "tree":
      return n ? { kind: "branch", label: `${repo}:${rest.join("/")}` } : null;
    case "blob": {
      const file = rest.at(-1);
      return file && rest.length > 1 ? { kind: "file", label: `${file}${line ? `:${line}` : ""}` } : null;
    }
    case "compare":
      return n ? { kind: "compare", label: `${repo} ${n.replace("...", "…")}` } : null;
    case "releases":
      return rest[0] === "tag" && rest[1] ? { kind: "release", label: `${repo} ${rest[1]}` } : null;
    default:
      return { kind: "repo", label: `${owner}/${repo}` };
  }
}

/** Whether a link's own text says nothing more than the address does, so the chip's label can stand in for it */
export function plainLinkText(text: string, href: string) {
  const t = text.trim();
  return t === href || t.replace(/^https?:\/\//, "") === href.replace(/^https?:\/\//, "") || sha.test(t) || /^#?\d+$/.test(t);
}
