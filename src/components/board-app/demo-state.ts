import { boardReducer, normalizeBoard, type BoardAction, type BoardState } from "@/lib/board-store";
import { columnMeta, defaultColumns, defaultPrefs, type Prefs } from "./fields";

/** A change someone else made, as it applies to any copy of the board */
export type Catch = (b: BoardState) => BoardState;

// `seen` is how many of the changes from other people the step's board already has
type Step = { board: BoardState; label: string; seen: number };

export type Demo = {
  board: BoardState;
  prefs: Prefs;
  restored: boolean;
  // The prefs as last read back from storage, so they aren't saved again as though someone had changed them
  synced?: Prefs;
  past: Step[];
  future: Step[];
  // Changes from other people that boards in the undo history may not have yet, oldest first, and how many
  // changes came before the first of them. A board in the history takes them on only when undo or redo brings it
  // back, rather than each change rewriting every board in the history as it arrives
  missed: Catch[];
  caught: number;
};

export type DemoAction =
  | BoardAction
  | { type: "restore"; board: BoardState | null; prefs: Partial<Prefs> | null }
  | { type: "prefs"; patch: Partial<Prefs> }
  | { type: "checkpoint"; label: string }
  | { type: "revert" }
  | { type: "silent"; action: BoardAction }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "undoTo"; depth: number }
  // Someone else's change. `current` applies it to the board on screen and `history` to the boards undo and redo go
  // back to. Without `history` those stay as they are, and null forgets them
  | { type: "rebase"; current: (b: BoardState) => BoardState; history?: Catch | null };

const LIMIT = 100;

export function describe(action: BoardAction, board: BoardState): string {
  switch (action.type) {
    case "update":
      return `${action.id} · ${action.note ?? "edited"}`;
    case "move":
      return `Moved ${action.id}`;
    case "bulk":
      return `${action.ids.length} tasks · ${action.note}`;
    case "add":
      return `Created “${action.title}”`;
    case "delete":
      return action.ids.length === 1
        ? `Deleted ${action.ids[0]} · ${board.tasks[action.ids[0]]?.title ?? ""}`
        : `Deleted ${action.ids.length} tasks`;
    case "undelete":
      return "Restored tasks";
    case "toggleSubtask":
    case "addSubtask":
      return `${action.id} · subtasks`;
    case "comment":
      return `${action.id} · commented`;
    case "vote":
      return `Voted on ${action.id}`;
    case "roadmap":
      return action.public ? "Made the roadmap public" : "Made the roadmap private";
    case "suggest":
      return `Suggested “${action.title}”`;
    case "page":
      return "Changed the public page";
    case "voteSuggestion":
      return "Voted on a suggestion";
    case "acceptSuggestion":
      return "Accepted a suggestion";
    case "declineSuggestion":
      return "Declined a suggestion";
    case "reset":
      return "Reset the demo";
    case "columns":
      return "Reordered cards";
  }
}

function mergePrefs(saved: Partial<Prefs> | null, base: Prefs): Prefs {
  if (!saved) return base;
  // A board's own fields keep their columns. Whether the field still exists is the table's to decide
  const known = (saved.columns ?? []).filter((c) => c.id in columnMeta || c.id.startsWith("f:"));
  const missing = defaultColumns.filter((d) => !known.some((c) => c.id === d.id));
  return {
    ...base,
    ...saved,
    columns: known.length ? [...known, ...missing] : base.columns,
    // Only filters someone chose to save come back. One left from last week hides tasks nobody remembers hiding
    filters: saved.keptFilters ?? base.filters,
    keptFilters: saved.keptFilters ?? {},
    collapsed: saved.collapsed ?? [],
  };
}

export function initDemo(board: BoardState, prefs: Partial<Prefs> = {}): Demo {
  return { board, prefs: { ...defaultPrefs, ...prefs }, restored: false, past: [], future: [], missed: [], caught: 0 };
}

// How many changes from other people have arrived so far
const seenNow = (demo: Demo) => demo.caught + demo.missed.length;

// A board from the history with the changes it missed, in the order they came
function caughtUp(demo: Demo, step: Step) {
  let board = step.board;
  for (let i = step.seen - demo.caught; i < demo.missed.length; i++) board = demo.missed[i](board);
  return board;
}

// Lets go of the changes that every board left in the history already has
function settle(demo: Demo): Demo {
  let oldest = seenNow(demo);
  for (const s of demo.past) oldest = Math.min(oldest, s.seen);
  for (const s of demo.future) oldest = Math.min(oldest, s.seen);
  if (oldest === demo.caught) return demo;
  return { ...demo, missed: demo.missed.slice(oldest - demo.caught), caught: oldest };
}

export function demoReducer(demo: Demo, action: DemoAction): Demo {
  switch (action.type) {
    case "restore": {
      const prefs = mergePrefs(action.prefs, demo.prefs);
      return {
        ...demo,
        board: action.board ? normalizeBoard(action.board) : demo.board,
        prefs,
        synced: prefs,
        restored: true,
      };
    }
    case "prefs":
      return { ...demo, prefs: { ...demo.prefs, ...action.patch } };
    case "checkpoint":
      return settle({
        ...demo,
        past: [...demo.past, { board: demo.board, label: action.label, seen: seenNow(demo) }].slice(-LIMIT),
        future: [],
      });
    case "revert": {
      const step = demo.past.at(-1);
      return step ? settle({ ...demo, board: caughtUp(demo, step), past: demo.past.slice(0, -1) }) : demo;
    }
    case "silent":
      return { ...demo, board: boardReducer(demo.board, action.action) };
    case "columns":
      return { ...demo, board: boardReducer(demo.board, action) };
    case "undo": {
      const step = demo.past.at(-1);
      if (!step) return demo;
      return settle({
        ...demo,
        board: caughtUp(demo, step),
        past: demo.past.slice(0, -1),
        future: [{ board: demo.board, label: step.label, seen: seenNow(demo) }, ...demo.future],
      });
    }
    case "redo": {
      const step = demo.future[0];
      if (!step) return demo;
      return settle({
        ...demo,
        board: caughtUp(demo, step),
        past: [...demo.past, { board: demo.board, label: step.label, seen: seenNow(demo) }],
        future: demo.future.slice(1),
      });
    }
    case "undoTo":
      return demo.past.length === action.depth + 1 ? demoReducer(demo, { type: "undo" }) : demo;
    case "rebase": {
      const board = action.current(demo.board);
      const kept = demo.past.length || demo.future.length;
      if (action.history === null && kept)
        return { ...demo, board, past: [], future: [], missed: [], caught: seenNow(demo) };
      // With no history to bring along, a change that changes nothing keeps the whole state, so React has nothing
      // to draw. Otherwise the history only notes the change, which costs the same however long the history is
      if (!action.history || !kept) return board === demo.board ? demo : { ...demo, board };
      return { ...demo, board, missed: [...demo.missed, action.history] };
    }
    default: {
      const board = boardReducer(demo.board, action);
      if (board === demo.board) return demo;
      const label = describe(action, demo.board);
      if (action.type === "page" && demo.past.at(-1)?.label === label) return settle({ ...demo, board, future: [] });
      return settle({
        ...demo,
        board,
        past: [...demo.past, { board: demo.board, label, seen: seenNow(demo) }].slice(-LIMIT),
        future: [],
      });
    }
  }
}
