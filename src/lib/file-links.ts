// Where task files live and how their addresses look, shared by the server and the page.
// A file is stored at <board>/<task number, or 0>/<id>-<name> and served at /api/files/<board>/<task>/<id>/<name>

export const maxFileBytes = 25 * 1024 * 1024;

export type FileInfo = {
  id: string;
  name: string;
  size: number;
  type: string;
  image: boolean;
  task: number | null;
  url: string;
  // What to put in a description or comment to show it: an image for pictures, a link for anything else
  markdown: string;
  uploaded: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isFileId = (s: string) => uuid.test(s);

/** A name safe for a path and a Markdown link: letters, digits, dots, dashes and underscores, kept short */
export function fileName(name: string) {
  const clean = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|-+$/g, "");
  if (!clean) return "file";
  if (clean.length <= 80) return clean;
  const dot = clean.lastIndexOf(".");
  const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
  return clean.slice(0, 80 - ext.length) + ext;
}

export const filePath = (board: string, task: number, id: string, name: string) => `${board}/${task}/${id}-${name}`;

export const fileUrlPath = (board: string, task: number, id: string, name: string) =>
  `/api/files/${board}/${task}/${id}/${name}`;

/** The parts of a file's address, from a whole URL or its path, or null when it isn't one */
export function parseFileUrl(url: string) {
  const m = url.match(/\/api\/files\/([0-9a-f-]{36})\/(\d+)\/([0-9a-f-]{36})\/([A-Za-z0-9._-]+)(?:[?#].*)?$/);
  if (!m || !isFileId(m[1]) || !isFileId(m[3])) return null;
  return { board: m[1], task: Number(m[2]), id: m[3], name: m[4] };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / 1024 / 102.4) / 10} MB`;
}
