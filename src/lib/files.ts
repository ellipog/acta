import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { can, type Permission, type Permissions, type Role } from "./live";
import { fileName, filePath, fileUrlPath, isFileId, maxFileBytes, type FileInfo } from "./file-links";

// Images and files put on tasks: pasted or dropped into a description or comment, attached to a task, or uploaded
// by an agent. They sit in a private bucket, so nothing reaches them except through /api/files, which checks who's
// asking. Members of the board's workspace can read every file on it. A task on a published roadmap shows its
// description to anyone, so its files can be read by anyone too, which is how a screenshot in a public task shows
// on the roadmap page. Files uploaded to a board before their task exists only reach members.
//
// There's no table: an object's path says where it belongs, <board>/<task number or 0>/<id>/<name>, and storage
// keeps its size, type and time. So it works with nothing more than the bucket, which is made on first use

export const fileBucket = "attachments";

// A client is cheap to make and holds no connection, so each call makes its own
const admin = () => createAdminClient();
const bucket = () => admin().storage.from(fileBucket);

// Only when an upload finds no bucket, so it's at most once per server unless the bucket goes away
async function makeBucket() {
  const { error } = await admin().storage.createBucket(fileBucket, { public: false, fileSizeLimit: maxFileBytes });
  // Another upload may have made it first
  if (error && !/exist/i.test(error.message)) throw error;
}

export class FileProblem extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** What an upload really is, from its first bytes rather than what it claims. Only these show in the page */
export function sniffImage(b: Uint8Array): string | null {
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0x89 && text(1, 4) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (text(0, 6) === "GIF87a" || text(0, 6) === "GIF89a") return "image/gif";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (text(4, 12) === "ftypavif") return "image/avif";
  return null;
}

// Files that open in the browser rather than download. Anything else, HTML and SVG included, is served as a
// download with its own type withheld, so nothing uploaded can run as a page on Acta's domain
const inlineTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "application/pdf"]);
const textTypes = /^(text\/(plain|csv|markdown|x-log)|application\/json)$/;

export function storedType(bytes: Uint8Array, claimed: string, name: string) {
  const image = sniffImage(bytes);
  if (image) return image;
  if (claimed === "application/pdf" && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") return claimed;
  if (textTypes.test(claimed) || /\.(txt|log|md|csv|json)$/i.test(name)) return claimed && textTypes.test(claimed) ? claimed : "text/plain";
  return "application/octet-stream";
}

/** Someone asking for a file: a person signed in, an agent's key, or nobody */
export type Asker = { userId: string; workspaces?: string[] | null; agentWrites?: boolean } | null;

type BoardRow = { id: string; workspace_id: string; prefix: string; roadmap_public: boolean };

async function boardRow(id: string): Promise<BoardRow | null> {
  if (!isFileId(id)) return null;
  const { data } = await admin().from("boards").select("id, workspace_id, prefix, roadmap_public").eq("id", id).maybeSingle();
  return (data as BoardRow | null) ?? null;
}

/** The board's row, from its id or its "workspace/board" */
export async function findBoard(ref: string): Promise<BoardRow | null> {
  if (isFileId(ref)) return boardRow(ref);
  const m = ref.trim().match(/(?:^|\/)([a-z0-9-]+)\/([a-z0-9-]+)\/?(?:#.*)?$/);
  if (!m) return null;
  const { data } = await admin()
    .from("boards")
    .select("id, workspace_id, prefix, roadmap_public, workspaces!inner (slug)")
    .eq("workspaces.slug", m[1])
    .eq("slug", m[2])
    .maybeSingle();
  if (!data) return null;
  const { id, workspace_id, prefix, roadmap_public } = data as unknown as BoardRow;
  return { id, workspace_id, prefix, roadmap_public };
}

async function memberCan(asker: Asker, workspaceId: string, what: Permission | "see") {
  if (!asker) return false;
  if (asker.workspaces && !asker.workspaces.includes(workspaceId)) return false;
  const { data } = await admin()
    .from("members")
    .select("role, permissions")
    .eq("workspace_id", workspaceId)
    .eq("user_id", asker.userId)
    .maybeSingle();
  if (!data) return false;
  if (what === "see") return true;
  return can(data.role as Role, (data as { permissions?: Permissions }).permissions, what);
}

/** A task's number from "ACT-12", "12" or 12, or 0 for none */
export function taskNumber(board: { prefix: string }, task: string | number | null | undefined) {
  if (task === null || task === undefined || task === "") return 0;
  const m = String(task).trim().match(/^(?:([A-Za-z][A-Za-z0-9]*)-)?(\d+)$/);
  if (!m || (m[1] && m[1].toUpperCase() !== board.prefix.toUpperCase()))
    throw new FileProblem(`“${task}” isn’t a task on this board. Use an id like ${board.prefix}-12.`);
  return Number(m[2]);
}

async function liveTask(boardId: string, number: number) {
  const { data } = await admin()
    .from("tasks")
    .select("number, public, deleted_at")
    .eq("board_id", boardId)
    .eq("number", number)
    .maybeSingle();
  return data as { number: number; public: boolean | null; deleted_at: string | null } | null;
}

export async function uploadFile(
  asker: Asker,
  input: { board: string; task?: string | number | null; name: string; type?: string; bytes: Uint8Array },
  origin: string,
): Promise<FileInfo> {
  if (!asker) throw new FileProblem("Sign in to upload files.", 401);
  if (asker.agentWrites === false) throw new FileProblem("This key can only read. Make a write key to upload files.", 403);
  const b = await findBoard(input.board);
  if (!b || !(await memberCan(asker, b.workspace_id, "see"))) throw new FileProblem("There’s no such board.", 404);
  if (!(await memberCan(asker, b.workspace_id, "comment")))
    throw new FileProblem("You can’t add files on this board.", 403);
  const number = taskNumber(b, input.task);
  if (number) {
    const t = await liveTask(b.id, number);
    if (!t || t.deleted_at) throw new FileProblem(`There’s no task ${b.prefix}-${number} on this board.`, 404);
  }
  if (!input.bytes.length) throw new FileProblem("That file is empty.");
  if (input.bytes.length > maxFileBytes)
    throw new FileProblem(`That file is larger than ${Math.round(maxFileBytes / 1024 / 1024)} MB.`, 413);

  const name = fileName(input.name);
  const type = storedType(input.bytes, (input.type ?? "").split(";")[0].trim().toLowerCase(), name);
  const id = randomUUID();
  const path = filePath(b.id, number, id, name);
  const put = () =>
    bucket().upload(path, input.bytes, { contentType: type, cacheControl: "31536000", upsert: false });
  let { error } = await put();
  if (error && /not.?found/i.test(error.message)) {
    await makeBucket();
    ({ error } = await put());
  }
  if (error) {
    console.error("File upload failed", error);
    throw new FileProblem("That didn’t upload. Try again.", 502);
  }
  return info(origin, b.id, number, id, name, input.bytes.length, type, new Date().toISOString());
}

function info(
  origin: string,
  board: string,
  task: number,
  id: string,
  name: string,
  size: number,
  type: string,
  at: string,
): FileInfo {
  const url = `${origin}${fileUrlPath(board, task, id, name)}`;
  const image = type.startsWith("image/");
  return {
    id,
    name,
    size,
    type,
    image,
    task: task || null,
    url,
    markdown: image ? `![${name}](${url})` : `[${name}](${url})`,
    uploaded: at,
  };
}

/** A task's files, newest last. Board-wide files, uploaded before a task existed, are task 0 */
export async function listFiles(asker: Asker, boardRef: string, task: string | number | null, origin: string) {
  const b = await findBoard(boardRef);
  if (!b || !(await memberCan(asker, b.workspace_id, "see"))) throw new FileProblem("There’s no such board.", 404);
  return filesOf(b.id, taskNumber(b, task), origin);
}

/** A task's files, for callers that already checked the board can be read */
export async function filesOf(boardId: string, number: number, origin: string): Promise<FileInfo[]> {
  const { data, error } = await bucket().list(`${boardId}/${number}`, {
    limit: 1000,
    sortBy: { column: "created_at", order: "asc" },
  });
  if (error || !data?.length) return [];
  return data.flatMap((f) => {
    const id = f.name.slice(0, 36);
    const name = f.name.slice(37);
    if (!isFileId(id) || f.name[36] !== "-" || !name) return [];
    const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
    return [info(origin, boardId, number, id, name, meta.size ?? 0, meta.mimetype ?? "application/octet-stream", f.created_at ?? "")];
  });
}

/** Whether someone may read a file, and how widely its answer can be cached */
async function readable(asker: Asker, b: BoardRow, number: number): Promise<"member" | "public" | null> {
  if (await memberCan(asker, b.workspace_id, "see")) return "member";
  if (!number || !b.roadmap_public) return null;
  const t = await liveTask(b.id, number);
  return t && t.public && !t.deleted_at ? "public" : null;
}

export async function readFile(asker: Asker, board: string, number: number, id: string, name: string) {
  const b = await boardRow(board);
  if (!b || !isFileId(id) || fileName(name) !== name) return null;
  const who = await readable(asker, b, number);
  if (!who) return null;
  const { data, error } = await bucket().download(filePath(b.id, number, id, name));
  if (error || !data) return null;
  return { blob: data, who };
}

export async function removeFile(asker: Asker, board: string, number: number, id: string, name: string) {
  const b = await boardRow(board);
  if (!b || !(await memberCan(asker, b.workspace_id, "see"))) throw new FileProblem("There’s no such file.", 404);
  if (!(await memberCan(asker, b.workspace_id, "edit"))) throw new FileProblem("You can’t remove files here.", 403);
  if (!isFileId(id) || fileName(name) !== name) throw new FileProblem("There’s no such file.", 404);
  const { error } = await bucket().remove([filePath(b.id, number, id, name)]);
  if (error) throw new FileProblem("That didn’t go through. Try again.", 502);
}

/** The headers a file is served with. Only images, PDFs and plain text open in place */
export function serveHeaders(type: string, name: string, size: number, who: "member" | "public") {
  const inline = inlineTypes.has(type) || textTypes.test(type);
  const shown = textTypes.test(type) ? `${type}; charset=utf-8` : inline ? type : "application/octet-stream";
  return {
    "Content-Type": shown,
    "Content-Length": String(size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    // A file never changes once it's uploaded. Members' copies stay in their own browser
    "Cache-Control": who === "member" ? "private, max-age=31536000, immutable" : "public, max-age=3600",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
}
