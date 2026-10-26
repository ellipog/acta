import { boardReducer, normalizeBoard, type BoardAction, type BoardState } from "@/lib/board-store";
import { columnMeta, defaultColumns, defaultPrefs, type Prefs } from "./fields";

type Step = { board: BoardState; label: string };

export type Demo = {
  board: BoardState;
  prefs: Prefs;
  restored: boolean;
  past: Step[];
  future: Step[];
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
  | { type: "rebase"; current: (b: BoardState) => BoardState; history: (b: BoardState) => BoardState | null };

const LIMIT = 100;

export function describe(action: BoardAction, board: BoardState): string {
  switch (action.type) {
    case "update":
      return `${action.id} · ${action.note ?? "edited"}`;
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
  const known = (saved.columns ?? []).filter((c) => c.id in columnMeta);
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
  return { board, prefs: { ...defaultPrefs, ...prefs }, restored: false, past: [], future: [] };
}

export function demoReducer(demo: Demo, action: DemoAction): Demo {
  switch (action.type) {
    case "restore":
      return {
        ...demo,
        board: action.board ? normalizeBoard(action.board) : demo.board,
        prefs: mergePrefs(action.prefs, demo.prefs),
        restored: true,
      };
    case "prefs":
      return { ...demo, prefs: { ...demo.prefs, ...action.patch } };
    case "checkpoint":
      return { ...demo, past: [...demo.past, { board: demo.board, label: action.label }].slice(-LIMIT), future: [] };
    case "revert": {
      const step = demo.past.at(-1);
      return step ? { ...demo, board: step.board, past: demo.past.slice(0, -1) } : demo;
    }
    case "silent":
      return { ...demo, board: boardReducer(demo.board, action.action) };
    case "columns":
      return { ...demo, board: boardReducer(demo.board, action) };
    case "undo": {
      const step = demo.past.at(-1);
      if (!step) return demo;
      return {
        ...demo,
        board: step.board,
        past: demo.past.slice(0, -1),
        future: [{ board: demo.board, label: step.label }, ...demo.future],
      };
    }
    case "redo": {
      const step = demo.future[0];
      if (!step) return demo;
      return {
        ...demo,
        board: step.board,
        past: [...demo.past, { board: demo.board, label: step.label }],
        future: demo.future.slice(1),
      };
    }
    case "undoTo":
      return demo.past.length === action.depth + 1 ? demoReducer(demo, { type: "undo" }) : demo;
    case "rebase": {
      const board = action.current(demo.board);
      const move = (steps: Step[]) => {
        const out: Step[] = [];
        for (const step of steps) {
          const b = action.history(step.board);
          if (!b) return [];
          out.push(b === step.board ? step : { ...step, board: b });
        }
        return out;
      };
      return { ...demo, board, past: move(demo.past), future: move(demo.future) };
    }
    default: {
      const board = boardReducer(demo.board, action);
      if (board === demo.board) return demo;
      const label = describe(action, demo.board);
      if (action.type === "page" && demo.past.at(-1)?.label === label) return { ...demo, board, future: [] };
      return {
        ...demo,
        board,
        past: [...demo.past, { board: demo.board, label }].slice(-LIMIT),
        future: [],
      };
    }
  }
}
