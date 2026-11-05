import { expect, mock, test } from "bun:test";
import * as z from "zod";
import { fakeSupabase } from "./fake-supabase";

mock.module("server-only", () => ({}));
// Listing tools never reaches the database. The agent API keeps the first client it gets, and test files share
// their modules, so this is the same stand-in agent-api.test.ts uses
mock.module("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase, serviceReady: false }));
const { actaTools } = await import("@/lib/agents/server");
const { fromQuery } = await import("@/lib/agents/api");

// The HTTP API serves the MCP server's tools. These check a key sees the tools its access allows, that the tools
// are made once rather than for every request, and that arguments sent in a query string come out as the types the
// tools expect

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

test("tools and their JSON Schemas are made once for the whole process, not for each request", () => {
  const named = (access: "read" | "write" | "manage", name: string) =>
    actaTools(agent(access)).find((t) => t.name === name)!;
  // Two keys, as two requests would have, share one tool
  expect(named("write", "update_tasks").input).toBe(named("manage", "update_tasks").input);
  expect(named("write", "update_tasks").inputJson()).toBe(named("manage", "update_tasks").inputJson());
  // What the MCP SDK asks each server for when it lists the tools or runs one
  const schema = named("read", "list_tasks").input["~standard"].jsonSchema;
  const once = schema.input({ target: "draft-2020-12" });
  expect(schema.input({ target: "draft-2020-12" })).toBe(once);
  expect(once).toEqual(z.toJSONSchema(named("read", "list_tasks").input, { target: "draft-2020-12", io: "input" }));
});

test("query strings become the types each tool expects", () => {
  const tool = actaTools(agent("read")).find((t) => t.name === "list_tasks")!;
  const args = fromQuery(tool, new URLSearchParams("board=aaen/acta&status=todo,review&status=done&limit=5&archived=true"));
  expect(args).toEqual({ board: "aaen/acta", status: ["todo", "review", "done"], limit: 5, archived: true });
  expect(tool.input.safeParse(args).success).toBe(true);
});
