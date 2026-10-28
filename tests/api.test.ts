import { expect, mock, test } from "bun:test";
import * as z from "zod";

mock.module("server-only", () => ({}));
// No database: listing tools never reaches it
mock.module("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}), serviceReady: false }));
const { actaTools } = await import("@/lib/agents/server");
const { fromQuery } = await import("@/lib/agents/api");

// The HTTP API serves the MCP server's tools. These check a key sees the tools its access allows and that
// arguments sent in a query string come out as the types the tools expect

const agent = (access: "read" | "write" | "manage") => ({
  keyId: "k",
  hash: "h",
  userId: "u",
  name: "Script",
  access,
  workspaces: null,
});

test("a key sees the tools its access allows", () => {
  const read = actaTools(agent("read")).map((t) => t.name);
  const write = actaTools(agent("write")).map((t) => t.name);
  const manage = actaTools(agent("manage")).map((t) => t.name);
  expect(read).toContain("list_tasks");
  expect(read).not.toContain("create_tasks");
  expect(write).toContain("create_tasks");
  expect(write).not.toContain("create_board");
  expect(manage).toContain("create_board");
  expect(actaTools(agent("read")).every((t) => t.readOnly)).toBe(true);
});

test("every tool describes its input as JSON schema", () => {
  for (const t of actaTools(agent("manage"))) expect(z.toJSONSchema(t.input, { io: "input" }).type).toBe("object");
});

test("query strings become the types each tool expects", () => {
  const tool = actaTools(agent("read")).find((t) => t.name === "list_tasks")!;
  const args = fromQuery(tool, new URLSearchParams("board=aaen/acta&status=todo,review&status=done&limit=5&archived=true"));
  expect(args).toEqual({ board: "aaen/acta", status: ["todo", "review", "done"], limit: 5, archived: true });
  expect(tool.input.safeParse(args).success).toBe(true);
});
