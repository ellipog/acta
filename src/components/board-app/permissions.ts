import type { BoardState } from "@/lib/board-store";
import type { Permission } from "@/lib/live";
import type { DemoAction } from "./demo-state";

// What a change on the board needs someone to be allowed. The database checks the same when it saves, in
// apply_board_changes, so this only spares people a change that would be taken back

export function needs(action: DemoAction, state?: BoardState): Permission[] {
  switch (action.type) {
    case "silent":
      return needs(action.action, state);
    case "comment":
    case "vote":
    case "suggest":
    case "voteSuggestion":
      return ["comment"];
    // The cards left behind move up, which is an edit too
    case "delete":
      return ["edit", "delete"];
    case "roadmap":
    case "page":
    case "declineSuggestion":
      return ["roadmap"];
    // Accepting an idea turns it into a task, and a vote you gave the idea goes with it
    case "acceptSuggestion":
      return state?.roadmap.suggestions.find((x) => x.id === action.id)?.voted
        ? ["roadmap", "edit", "comment"]
        : ["roadmap", "edit"];
    case "columns":
    case "move":
    case "update":
    case "bulk":
    case "add":
    case "undelete":
    case "toggleSubtask":
    case "addSubtask":
      return ["edit"];
    default:
      return [];
  }
}

export const refusal: Record<Permission, string> = {
  edit: "You can see this board, but not change its tasks.",
  delete: "You can’t delete tasks here.",
  comment: "You can’t comment or vote here.",
  boards: "You can’t change boards here.",
  roadmap: "You can’t change the public roadmap here.",
  invite: "You can’t invite people here.",
};
