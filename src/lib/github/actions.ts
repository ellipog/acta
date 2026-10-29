"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuth } from "@/lib/workspace";
import { asApp, githubAll, githubReady } from "./app";
import { repoSettings, type RepoSettings } from "./match";
import { flushOutbox, importIssues, linkByHand, LinkProblem, openIssueByHand, unlinkByHand, type ByHand } from "./sync";

// Linking a workspace's repositories to its boards. Only owners and admins may, and the server writes the links,
// since people only read them

type Result = { ok: boolean; message: string };
export type AvailableRepo = { id: number; installation: number; fullName: string; private: boolean };

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

async function managing(workspace: string) {
  if (!githubReady || !isUuid(workspace)) return null;
  const auth = await getAuth();
  if (!auth) return null;
  const { data } = await auth.supabase.rpc("is_manager", { ws: workspace });
  return data ? createAdminClient() : null;
}

async function installations(db: ReturnType<typeof createAdminClient>, workspace: string) {
  const { data } = await db.from("github_installations").select("id").eq("workspace_id", workspace);
  return (data ?? []).map((i) => i.id as number);
}

/** The repositories the workspace's installations can reach */
export async function availableRepos(workspace: string): Promise<AvailableRepo[]> {
  const db = await managing(workspace);
  if (!db) return [];
  const out: AvailableRepo[] = [];
  for (const installation of await installations(db, workspace)) {
    const repos = await githubAll<{ id: number; full_name: string; private: boolean }>(
      installation,
      "/installation/repositories",
      500,
      (page) => (page as { repositories: { id: number; full_name: string; private: boolean }[] }).repositories,
    ).catch(() => []);
    out.push(...repos.map((r) => ({ id: r.id, installation, fullName: r.full_name, private: r.private })));
  }
  return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function linkRepo(workspace: string, repo: number, board: string): Promise<Result> {
  const db = await managing(workspace);
  if (!db) return { ok: false, message: "Only owners and admins can link repositories." };
  const found = (await availableRepos(workspace)).find((r) => r.id === repo);
  if (!found) return { ok: false, message: "The GitHub app can’t reach that repository." };
  const { data: b } = await db.from("boards").select("id").eq("id", board).eq("workspace_id", workspace).maybeSingle();
  if (!b) return { ok: false, message: "That board isn’t in this workspace." };
  const { error } = await db.from("github_repos").upsert({
    id: found.id,
    installation_id: found.installation,
    board_id: board,
    full_name: found.fullName,
    private: found.private,
  });
  if (error) return { ok: false, message: "That didn’t save. Try again." };
  refresh();
  return { ok: true, message: `Linked ${found.fullName}.` };
}

export async function updateRepo(
  workspace: string,
  repo: number,
  change: { board?: string; settings?: RepoSettings },
): Promise<Result> {
  const db = await managing(workspace);
  if (!db) return { ok: false, message: "Only owners and admins can change this." };
  const { data: current } = await db
    .from("github_repos")
    .select("settings, github_installations!inner(workspace_id)")
    .eq("id", repo)
    .eq("github_installations.workspace_id", workspace)
    .maybeSingle();
  if (!current) return { ok: false, message: "That repository isn’t linked." };
  const patch: Record<string, unknown> = {};
  if (change.board) {
    const { data: b } = await db
      .from("boards")
      .select("id")
      .eq("id", change.board)
      .eq("workspace_id", workspace)
      .maybeSingle();
    if (!b) return { ok: false, message: "That board isn’t in this workspace." };
    patch.board_id = change.board;
  }
  const before = repoSettings(current.settings);
  if (change.settings) patch.settings = repoSettings(change.settings);
  const { error } = await db.from("github_repos").update(patch).eq("id", repo);
  if (error) return { ok: false, message: "That didn’t save. Try again." };
  // Turning issues on, or moving to another board, brings the issues over
  const settings = change.settings ? repoSettings(change.settings) : before;
  if (settings.issues && (!before.issues || change.board))
    after(() => importIssues(repo).catch((e) => console.error("GitHub issue import failed", e)));
  refresh();
  return { ok: true, message: settings.issues && !before.issues ? "Saved. Bringing its issues over…" : "Saved." };
}

export async function unlinkRepo(workspace: string, repo: number): Promise<Result> {
  const db = await managing(workspace);
  if (!db) return { ok: false, message: "Only owners and admins can change this." };
  const ids = await installations(db, workspace);
  const { error } = await db.from("github_repos").delete().eq("id", repo).in("installation_id", ids);
  if (error) return { ok: false, message: "That didn’t save. Try again." };
  refresh();
  return { ok: true, message: "Unlinked. Tasks keep their history, without its pull requests." };
}

/** Removes the app from the GitHub account too, so nothing is left reaching the repositories */
export async function disconnectGitHub(workspace: string, installation: number): Promise<Result> {
  const db = await managing(workspace);
  if (!db) return { ok: false, message: "Only owners and admins can change this." };
  if (!(await installations(db, workspace)).includes(installation))
    return { ok: false, message: "That GitHub account isn’t connected here." };
  await asApp(`/app/installations/${installation}`, { method: "DELETE" }).catch(() => {});
  await db.from("github_installations").delete().eq("id", installation);
  refresh();
  return { ok: true, message: "Disconnected from GitHub." };
}

// Linking GitHub work to one task by hand, and opening an issue from one. Anyone who may edit the board may, and
// the task's changes are saved as them

type HandResult = Result & { url?: string };

async function editing(board: string) {
  if (!githubReady || !isUuid(board)) return null;
  const auth = await getAuth();
  if (!auth) return null;
  // Row security only shows the board to its members
  const { data: b } = await auth.supabase.from("boards").select("workspace_id").eq("id", board).maybeSingle();
  if (!b) return null;
  const { data: ok } = await auth.supabase.rpc("can", { ws: b.workspace_id, what: "edit" });
  return ok ? auth : null;
}

async function byHand(board: string, run: () => Promise<ByHand>, said: (done: ByHand) => string): Promise<HandResult> {
  const auth = await editing(board);
  if (!auth) return { ok: false, message: "You can’t edit tasks on this board." };
  try {
    const done = await run();
    const { error } = await auth.supabase.rpc("apply_board_changes", { p_board: board, p_changes: done.changes });
    if (error) console.error("Saving a GitHub link failed", error);
    after(() => flushOutbox(board).catch((e) => console.error("GitHub flush failed", e)));
    return { ok: true, message: said(done), url: done.url };
  } catch (error) {
    if (error instanceof LinkProblem) return { ok: false, message: error.message };
    console.error("GitHub by hand failed", error);
    return { ok: false, message: "GitHub didn’t answer. Try again." };
  }
}

export async function linkToTask(board: string, number: number, url: string) {
  return byHand(board, () => linkByHand(board, number, url), (d) => `Linked ${d.label}.`);
}

export async function unlinkFromTask(board: string, number: number, link: string) {
  if (!isUuid(link)) return { ok: false, message: "That isn’t linked to this task." };
  return byHand(board, () => unlinkByHand(board, number, { id: link }), (d) => `Unlinked ${d.label}.`);
}

export async function openIssueFromTask(board: string, number: number, repo?: string) {
  return byHand(board, () => openIssueByHand(board, number, repo), (d) => `Opened ${d.label}.`);
}
