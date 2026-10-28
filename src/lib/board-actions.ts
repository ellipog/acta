import { toast } from "@/components/ui/toast";
import { boardIcon } from "./board-icons";
import { boardPath, forgetBoard, moveBoard, rememberBoard } from "./board-cache";
import { doneAdding, dropEdit, editBoard, markSaved, startAdding } from "./board-edits";
import { boardState, type NestedBoard } from "./board-load";
import { fieldTypes, newId, type CustomField, type Label, type Project, type StatusNames } from "./board-store";
import type { LiveBoard } from "./live";
import { boardPrefixFor, boardSlugFor, boardSlugProblem } from "./slugs";
import { loadClient } from "./supabase/browser";

// Changes to boards themselves, made straight from the browser. Each shows at once through board-edits, saves
// behind it and is taken back with a toast if saving fails

type Router = { push: (href: string) => void; replace: (href: string) => void; refresh: () => void };

export type BoardFields = {
  name?: string;
  icon?: string;
  slug?: string;
  labels?: Label[];
  projects?: Project[];
  fields?: CustomField[];
  statusNames?: StatusNames;
};

// Keeps a board's fields to ones the database and the board can use: named once each, of a known type, with the
// options a select needs
export function tidyFields(list: CustomField[]): CustomField[] {
  const seen = new Set<string>();
  const out: CustomField[] = [];
  for (const f of list) {
    const name = f.name.trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase()) || !fieldTypes.some((t) => t.id === f.type)) continue;
    seen.add(name.toLowerCase());
    const field: CustomField = { id: f.id || newId().slice(0, 8), name, type: f.type };
    if (f.type === "select" || f.type === "multi")
      field.options = [...new Set((f.options ?? []).map((o) => o.trim().slice(0, 40)).filter(Boolean))].slice(0, 50);
    out.push(field);
  }
  return out.slice(0, 30);
}

// Trims names, drops empty and repeated ones and keeps to the limit the database allows
function tidy<T extends { tone: string }>(list: T[], key: "id" | "name") {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of list) {
    const name = String((x as Record<string, unknown>)[key] ?? "")
      .trim()
      .slice(0, 40);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ ...x, [key]: name });
  }
  return out.slice(0, 30);
}

const failed = (title: string, description = "Your change was undone. Try again.") =>
  toast({ icon: "x", title, description });

export async function saveBoard(
  board: { id: string; slug: string },
  change: BoardFields,
  ctx: { workspace: string; current: boolean; router: Router; keep?: () => void },
) {
  const patch: {
    name?: string;
    icon?: string;
    slug?: string;
    labels?: Label[];
    projects?: Project[];
    fields?: CustomField[];
    status_names?: StatusNames;
  } = {};
  if (change.name !== undefined) {
    const name = change.name.trim().slice(0, 60);
    if (!name) return failed("A board needs a name", "Nothing was changed.");
    patch.name = name;
  }
  const slug = change.slug?.replace(/-+$/, "");
  if (slug && slug !== board.slug) {
    const problem = boardSlugProblem(slug);
    if (problem) return failed(`The address: ${problem.toLowerCase()}`, "Nothing was changed.");
    patch.slug = slug;
  }
  if (change.icon) patch.icon = boardIcon(change.icon);
  if (change.labels) patch.labels = tidy(change.labels, "id");
  if (change.projects) patch.projects = tidy(change.projects, "name");
  if (change.fields) patch.fields = tidyFields(change.fields);
  if (change.statusNames)
    patch.status_names = Object.fromEntries(
      Object.entries(change.statusNames)
        .map(([k, v]) => [k, (v ?? "").trim().slice(0, 30)])
        .filter(([, v]) => v),
    );
  if (!Object.keys(patch).length) return;

  // A new address only shows once it works, since links to it lead nowhere until then
  const v = editBoard(board.id, {
    name: patch.name,
    icon: patch.icon,
    labels: patch.labels,
    projects: patch.projects,
    fields: patch.fields,
    statusNames: patch.status_names,
  });
  const supabase = await loadClient();
  const { error } = await supabase.from("boards").update(patch).eq("id", board.id);
  if (error) {
    dropEdit(board.id, v);
    return failed(error.code === "23505" ? "Another board here has that address" : "The board didn’t save");
  }
  if (patch.slug) {
    ctx.keep?.();
    moveBoard(boardPath(ctx.workspace, board.slug), boardPath(ctx.workspace, patch.slug), patch.slug);
    editBoard(board.id, { slug: patch.slug });
    if (ctx.current) ctx.router.replace(`/${ctx.workspace}/${patch.slug}`);
  }
  markSaved(board.id, v);
  ctx.router.refresh();
}

export async function removeBoard(
  board: { id: string; slug: string; name: string },
  ctx: { workspace: string; current: boolean; next: string | null; router: Router },
) {
  const v = editBoard(board.id, { gone: true });
  // Off the board straight away, unless it's the last one and the workspace page would only bring it back
  if (ctx.current && ctx.next) ctx.router.push(`/${ctx.workspace}/${ctx.next}`);
  const supabase = await loadClient();
  const { data, error } = await supabase.from("boards").delete().eq("id", board.id).select("id");
  if (error || !data?.length) {
    dropEdit(board.id, v);
    return failed(`${board.name} wasn’t deleted`, "Only owners and admins can delete boards.");
  }
  forgetBoard(boardPath(ctx.workspace, board.slug));
  markSaved(board.id, v);
  toast({ icon: "trash", title: `Deleted ${board.name}`, duration: 2400 });
  if (ctx.current && !ctx.next) ctx.router.replace(`/${ctx.workspace}`);
  else ctx.router.refresh();
}

/** Makes a board and opens it. It shows in the sidebar while it's made, and opens empty without waiting on the page */
export async function addBoard(live: LiveBoard, name: string, router: Router) {
  const clean = name.trim().slice(0, 60);
  if (!clean) return;
  const key = startAdding(live.workspace.id, clean);
  const supabase = await loadClient();
  let taken = live.boards.map((b) => b.slug);
  let made: Omit<NestedBoard, "tasks" | "suggestions"> | null = null;
  for (let attempt = 0; attempt < 2 && !made; attempt++) {
    const { data, error } = await supabase
      .from("boards")
      .insert({ workspace_id: live.workspace.id, slug: boardSlugFor(clean, taken), name: clean, prefix: boardPrefixFor(clean) })
      .select("*")
      .single();
    made = data;
    // Someone else took the address in the meantime
    if (error?.code !== "23505") break;
    const { data: all } = await supabase.from("boards").select("slug").eq("workspace_id", live.workspace.id);
    taken = (all ?? []).map((b) => b.slug as string);
  }
  if (!made) {
    doneAdding(key);
    return failed(`${clean} wasn’t created`, "Try again in a moment.");
  }

  const at = Date.now();
  const names = new Map(live.members.map((m) => [m.id, m.name]));
  const state = boardState({ ...made, tasks: [], suggestions: [] }, (id) => (id && names.get(id)) || "Former member");
  rememberBoard(
    {
      ...live,
      boards: [...live.boards, { id: made.id, slug: made.slug, name: made.name, icon: made.icon, count: 0 }],
      board: {
        id: made.id,
        slug: made.slug,
        name: made.name,
        prefix: made.prefix,
        labels: made.labels ?? [],
        projects: made.projects ?? [],
        fields: made.fields ?? [],
        statusNames: made.status_names ?? {},
        icon: made.icon,
      },
      state,
      at,
    },
    state,
    at,
  );
  router.push(`/${live.workspace.slug}/${made.slug}`);
  doneAdding(key);
}
