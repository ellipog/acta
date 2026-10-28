import "server-only";
import * as z from "zod";
import { Problem } from "./acta";
import { agentFor, type Agent } from "./keys";
import { actaTools, type Tool } from "./server";

// The HTTP API: the MCP server's tools as plain JSON over HTTP, for scripts, forms, automations and anything else
// that wants to plug into Acta. It takes the same keys and goes through the same code, so a key can do exactly as
// much here as it can over MCP. POST /api/v1/<tool> with the tool's arguments as a JSON body, or GET it with them
// in the query string when the tool only reads. GET /api/v1 lists the tools this key can use

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const answer = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });
const problem = (status: number, message: string, extra?: object) => answer({ error: message, ...extra }, status);

async function keyed(request: Request) {
  const found = await agentFor(request);
  if (!(found instanceof Response)) return found.agent;
  const body = await found.json();
  return problem(found.status, body.error_description ?? "Not allowed");
}

export async function index(request: Request) {
  const agent = await keyed(request);
  if (agent instanceof Response) return agent;
  return answer({
    access: agent.access,
    tools: actaTools(agent).map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      method: t.readOnly ? ["GET", "POST"] : ["POST"],
      url: `/api/v1/${t.name}`,
      input: z.toJSONSchema(t.input, { io: "input" }),
    })),
  });
}

function unwrap(schema: z.ZodType): z.ZodType {
  const def = (schema as { def?: { type?: string; innerType?: z.ZodType } }).def;
  return def?.innerType && (def.type === "optional" || def.type === "nullable" || def.type === "default")
    ? unwrap(def.innerType)
    : schema;
}

// Query strings only carry text, so each value is read as what its field expects. Lists can repeat the name or
// separate values with commas
export function fromQuery(tool: Tool, params: URLSearchParams) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    const field = tool.input.shape[key] as z.ZodType | undefined;
    const kind = field ? (unwrap(field) as { def?: { type?: string } }).def?.type : undefined;
    if (kind === "array") out[key] = values.flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
    else if (kind === "number") out[key] = Number(values[0]);
    else if (kind === "boolean") out[key] = values[0] === "true" || values[0] === "1";
    else out[key] = values[0];
  }
  return out;
}

async function input(request: Request, tool: Tool) {
  if (request.method === "GET") return fromQuery(tool, new URL(request.url).searchParams);
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Problem("The body isn’t valid JSON.");
  }
}

function find(agent: Agent, name: string) {
  const tool = actaTools(agent).find((t) => t.name === name);
  if (tool) return tool;
  const exists = actaTools({ ...agent, access: "manage" }).some((t) => t.name === name);
  return exists
    ? problem(403, `This key can’t use ${name}. Make a key with more access under Account → Agents.`)
    : problem(404, `There’s no tool called ${name}. GET /api/v1 lists them.`);
}

export async function call(request: Request, name: string) {
  const agent = await keyed(request);
  if (agent instanceof Response) return agent;
  const tool = find(agent, name);
  if (tool instanceof Response) return tool;
  if (request.method === "GET" && !tool.readOnly)
    return problem(405, `${name} changes things, so it takes a POST.`);
  try {
    const parsed = tool.input.safeParse(await input(request, tool));
    if (!parsed.success)
      return problem(400, "Some of the arguments aren’t right.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    return answer(await tool.work(parsed.data));
  } catch (error) {
    if (error instanceof Problem) return problem(400, error.message);
    console.error("API call failed", name, error);
    return problem(500, "Acta couldn’t do that just now. Try again in a moment.");
  }
}
