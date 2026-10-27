import { newId, statusTitle, type StatusCategory } from "./board-store";
import { loadClient } from "./supabase/browser";

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

/**
 * Moves one of your tasks to another status from My tasks, the way the board would: last in its new column, with
 * the day it shipped and a line in its activity. Returns the error when it didn't save
 */
export async function moveTask(board: string, number: number, from: StatusCategory, to: StatusCategory) {
  const supabase = await loadClient();
  const { data: last } = await supabase
    .from("tasks")
    .select("position")
    .eq("board_id", board)
    .eq("status", to)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fields: Record<string, unknown> = { status: to };
  if (to === "done") fields.shipped_on = today();
  else if (from === "done") fields.shipped_on = null;
  try {
    const { error } = await supabase.rpc("apply_board_changes", {
      p_board: board,
      p_changes: {
        updated: [{ number, fields }],
        order: [{ number, position: Math.floor(last?.position ?? -1) + 1 }],
        activity: [{ id: newId(), number, text: `moved it to ${statusTitle[to]}` }],
      },
    });
    return error;
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Network error", code: "" };
  }
}
