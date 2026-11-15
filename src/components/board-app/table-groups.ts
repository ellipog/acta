"use client";

import { useMemo } from "react";
import { closed, statuses, type BoardState, type StatusCategory, type Task } from "@/lib/board-store";
import { compareBy, fieldOptions, noteFor, patchFor, valueOf, type Prefs } from "./fields";
import { reading, unseen, waiting, type ShelfInfo } from "./shelf-info";

export type Group = {
  key: string;
  title: string;
  icon?: React.ReactNode;
  rows: Task[];
  patch: Partial<Task>;
  note?: string;
  // Grouped by status, the shelf of tasks the group is, when some of it is still on the server
  shelf?: StatusCategory;
  more?: { count: number; loading: boolean };
};

/**
 * The table's rows, sorted, and the groups they fall into. The table and the list a phone shows in its place
 * read the same ones, so a board looks the same however it's opened
 */
export function useTableGroups({
  state,
  visible,
  prefs,
  filtered,
  shelves,
}: {
  state: BoardState;
  visible: (t: Task) => boolean;
  prefs: Prefs;
  filtered: boolean;
  shelves?: ShelfInfo;
}) {
  const { grouping, sort } = prefs;
  // Follows the tasks and columns rather than the whole board, so a change elsewhere on it, like a vote on an idea,
  // doesn't sort the table again
  const { columns: boardColumns, tasks: boardTasks } = state;
  const rows = useMemo(() => {
    const all = statuses.flatMap((s) => boardColumns[s.id].map((id) => boardTasks[id])).filter((t) => t && visible(t));
    if (!sort) return all;
    const by = compareBy(sort.key);
    return all.sort((a, b) => by(a, b) * sort.dir);
  }, [boardColumns, boardTasks, visible, sort]);

  const groups = useMemo<Group[]>(() => {
    if (!rows.length && filtered) return [];
    if (grouping === "none") return [{ key: "all", title: "", rows, patch: {} }];
    const filteringThis = grouping !== "size" && (prefs.filters[grouping]?.length ?? 0) > 0;
    return (
      fieldOptions[grouping]
        .map((o): Group => {
          // Grouped by status, a group is a shelf of tasks, and those still on the server count and are on their way
          const shelf = grouping === "status" ? (o.value as StatusCategory) : undefined;
          const only = prefs.filters.status;
          const hidden = shelf && ((closed(shelf) && prefs.filters.hideDone) || (only?.length && !only.includes(shelf)));
          return {
            key: `${grouping}:${o.value}`,
            title: o.label,
            icon: o.icon,
            rows: rows.filter((r) => valueOf(r, grouping)[0] === o.value),
            patch: patchFor(grouping, o.value),
            note: noteFor(grouping, o.value),
            shelf,
            more:
              shelf && !hidden && waiting(shelves, shelf)
                ? { count: unseen(shelves, shelf), loading: reading(shelves, shelf) }
                : undefined,
          };
        })
        // Canceled only shows once something is in it
        .filter(
          (g) =>
            g.rows.length ||
            g.more ||
            (grouping === "status" &&
              !filteringThis &&
              g.key !== "status:canceled" &&
              !(prefs.filters.hideDone && g.key === "status:done")),
        )
    );
  }, [rows, grouping, prefs.filters, filtered, shelves]);

  return { rows, groups };
}
