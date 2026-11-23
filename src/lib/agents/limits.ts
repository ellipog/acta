import type { Access } from "./keys";

const levels: Access[] = ["read", "write", "manage"];

export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export type KeyLimits = { name: string; access: Access; workspaces: string[] | null };

// A key's name, what it can do and where, checked the same way when it's made, changed, or given to an agent that
// signed in
export function keyLimits(name: unknown, access: unknown, some: boolean, workspaces: unknown[]): KeyLimits | string {
  const clean = String(name ?? "")
    .trim()
    .slice(0, 40)
    .trim();
  const picked = [...new Set(workspaces.map(String).filter(isUuid))].slice(0, 50);
  if (!clean) return "Name the key after the agent that will use it.";
  if (!levels.includes(access as Access)) return "Choose what the key can do.";
  if (some && !picked.length) return "Choose at least one workspace.";
  return { name: clean, access: access as Access, workspaces: some ? picked : null };
}
