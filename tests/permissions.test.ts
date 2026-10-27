import { expect, test } from "bun:test";
import { revert, saveChanges } from "@/lib/board-save";
import { boardReducer, type BoardAction, type BoardState } from "@/lib/board-store";
import { diffBoards, toWire } from "@/lib/board-sync";
import { can, permissionList, roleAllows, type Role } from "@/lib/live";
import { needs } from "@/components/board-app/permissions";
import { FakeBoardServer, required } from "./fake-server";

// Who may change what. The board turns a change down before it's made when someone isn't allowed it, and the
// database checks again when it saves. These keep the two in step

const run = (s: BoardState, ...a: BoardAction[]) => a.reduce(boardReducer, s);

async function seeded() {
  const server = new FakeBoardServer();
  const empty = server.load();
  const start = run(
    empty,
    { type: "add", status: "todo", title: "One" },
    { type: "add", status: "todo", title: "Two" },
    { type: "addSubtask", id: "ACT-1", title: "Sketch" },
    { type: "suggest", title: "Dark mode" },
  );
  const { base } = await saveChanges(empty, start, server.send, "ACT");
  return { server, base };
}

test("each role starts from its own defaults", () => {
  const all = permissionList.map((p) => p.id);
  for (const role of ["owner", "admin"] as Role[]) expect(all.every((p) => can(role, {}, p))).toBe(true);
  expect(all.filter((p) => can("member", {}, p))).toEqual(["edit", "delete", "comment", "boards", "roadmap"]);
  expect(all.filter((p) => can("viewer", {}, p))).toEqual(["comment"]);
});

test("what's set for a person wins over their role, except for owners and admins", () => {
  expect(can("member", { delete: false }, "delete")).toBe(false);
  expect(can("member", { invite: true }, "invite")).toBe(true);
  expect(can("viewer", { edit: true }, "edit")).toBe(true);
  expect(can("viewer", { comment: false }, "comment")).toBe(false);
  expect(can("admin", { edit: false }, "edit")).toBe(true);
  expect(roleAllows("viewer", "edit")).toBe(false);
});

test("the board asks for the same permissions the database checks", async () => {
  const { base } = await seeded();
  const idea = base.roadmap.suggestions[0].id;
  const actions: BoardAction[] = [
    { type: "add", status: "todo", title: "Three" },
    { type: "update", id: "ACT-1", patch: { title: "Renamed" }, note: "renamed the task" },
    { type: "update", id: "ACT-1", patch: { status: "done" }, note: "moved it to Done" },
    { type: "bulk", ids: ["ACT-1", "ACT-2"], patch: { priority: "high" }, note: "set priority to High" },
    { type: "bulk", ids: ["ACT-1"], patch: { archived: "2026-10-27T10:00:00.000Z" }, note: "archived the task" },
    { type: "move", id: "ACT-2", to: "todo", before: "ACT-1" },
    { type: "move", id: "ACT-1", to: "review", before: null, note: "moved it to In review" },
    { type: "columns", columns: { ...base.columns, todo: ["ACT-2", "ACT-1"] } },
    { type: "delete", ids: ["ACT-2"] },
    { type: "toggleSubtask", id: "ACT-1", subId: base.tasks["ACT-1"].subtasks[0].id },
    { type: "addSubtask", id: "ACT-2", title: "Write" },
    { type: "comment", id: "ACT-1", body: "Looks good" },
    { type: "vote", id: "ACT-1" },
    { type: "roadmap", public: true },
    { type: "page", patch: { title: "Our roadmap" } },
    { type: "suggest", title: "Exports" },
    { type: "voteSuggestion", id: idea },
    { type: "declineSuggestion", id: idea },
    { type: "acceptSuggestion", id: idea },
  ];
  for (const action of actions) {
    const after = boardReducer(base, action);
    const database = required(toWire(diffBoards(base, after), after));
    const board = needs(action, base);
    // Nothing gets past the board that the database would turn down
    expect({ action: action.type, missed: database.filter((p) => !board.includes(p)) }).toEqual({
      action: action.type,
      missed: [],
    });
    // And the board asks for no more than that. Taking back your own vote needs nothing, but asks the same as
    // voting, so it's left out of this
    if (database.length)
      expect({ action: action.type, extra: board.filter((p) => !database.includes(p)) }).toEqual({
        action: action.type,
        extra: [],
      });
  }
});

test("a viewer's comment saves", async () => {
  const { server, base } = await seeded();
  server.role = "viewer";
  const ui = run(base, { type: "comment", id: "ACT-1", body: "Can we ship this Friday?" }, { type: "vote", id: "ACT-1" });
  const result = await saveChanges(base, ui, server.send, "ACT");
  expect(result.refused).toEqual([]);
  expect(server.comments.map((c) => c.body)).toEqual(["Can we ship this Friday?"]);
  expect(server.votes).toHaveLength(1);
});

test("an edit someone isn't allowed is taken back, and what they are allowed still saves", async () => {
  const { server, base } = await seeded();
  server.role = "viewer";
  const ui = run(
    base,
    { type: "update", id: "ACT-1", patch: { title: "Sneaky" }, note: "renamed the task" },
    { type: "comment", id: "ACT-2", body: "Fair enough" },
  );
  const result = await saveChanges(base, ui, server.send, "ACT");
  expect(result.refused.map((r) => r.why)).toEqual(["You don’t have permission to make this change."]);
  const shown = result.refused.reduce((s, r) => revert(s, result.base, r.diff), ui);
  expect(shown.tasks["ACT-1"].title).toBe("One");
  expect(shown.tasks["ACT-2"].thread?.map((c) => c.body)).toEqual(["Fair enough"]);
  expect(server.tasks.get(1)?.title).toBe("One");
});

test("a member who may not delete keeps the task", async () => {
  const { server, base } = await seeded();
  server.role = "member";
  server.permissions = { delete: false };
  const ui = run(base, { type: "delete", ids: ["ACT-2"] });
  const result = await saveChanges(base, ui, server.send, "ACT");
  expect(result.refused).toHaveLength(1);
  expect(revert(ui, result.base, result.refused[0].diff).tasks["ACT-2"]?.title).toBe("Two");
  expect(server.tasks.get(2)?.deleted_at).toBeNull();
});
