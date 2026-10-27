import type { BoardAction, BoardState, Task } from "@/lib/board-store";

// Where a row dragged in the table lands. The table shows tasks grouped by any field, but their order is kept
// per status column, the same order the board shows. So a drop becomes: take the group's value, then sit just
// before the nearest row below the drop that shares the task's status, or else just after the nearest above it

export type DropGroup = { key: string; rows: Task[]; patch: Partial<Task>; note?: string };
// index is where in the group's rows, as shown, the row goes: 0 is the top, rows.length the end
export type DropAt = { group: string; index: number };

export function planDrop(state: BoardState, groups: DropGroup[], id: string, at: DropAt): BoardAction | null {
  const task = state.tasks[id];
  const group = groups.find((g) => g.key === at.group);
  if (!task || !group) return null;
  const from = groups.find((g) => g.rows.some((r) => r.id === id));
  const patch =
    from?.key === group.key
      ? {}
      : Object.fromEntries(
          Object.entries(group.patch).filter(
            ([k, v]) => JSON.stringify(task[k as keyof Task] ?? null) !== JSON.stringify(v ?? null),
          ),
        );
  const to = (patch as Partial<Task>).status ?? task.status;
  const index = Math.max(0, Math.min(at.index, group.rows.length));
  const below = group.rows.slice(index).filter((r) => r.id !== id);
  const above = group.rows.slice(0, index).filter((r) => r.id !== id);
  const column = state.columns[to].filter((x) => x !== id);

  let before: string | null = null;
  const next = below.find((r) => r.status === to);
  const prev = [...above].reverse().find((r) => r.status === to);
  if (next) before = next.id;
  else if (prev) before = column[column.indexOf(prev.id) + 1] ?? null;
  // Nothing else in the group shares its status, so where it sits among them can't change. It stays put
  else if (to === task.status) before = state.columns[to][state.columns[to].indexOf(id) + 1] ?? null;
  // Into a status where the group has nothing else: dropped at the end goes last, anywhere else first
  else if (!below.length && above.length) before = null;
  else before = column[0] ?? null;

  return {
    type: "move",
    id,
    to,
    before,
    ...(Object.keys(patch).length ? { patch, note: group.note } : {}),
  };
}

/** One step up or down the table, for Alt with the arrow keys */
export function planStep(state: BoardState, groups: DropGroup[], id: string, step: -1 | 1): BoardAction | null {
  const group = groups.find((g) => g.rows.some((r) => r.id === id));
  if (!group) return null;
  const i = group.rows.findIndex((r) => r.id === id);
  const target = step < 0 ? i - 1 : i + 2;
  if (target < 0 || target > group.rows.length) return null;
  return planDrop(state, groups, id, { group: group.key, index: target });
}
