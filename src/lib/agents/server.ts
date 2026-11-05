import "server-only";
import { McpServer, type ToolAnnotations } from "@modelcontextprotocol/server";
import * as z from "zod";
import { boardIcons } from "@/lib/board-icons";
import { githubReady } from "@/lib/github/app";
import { actaFor, githubFilters, Problem, sortKeys, taskStatuses, type Acta } from "./acta";
import { accessRank, type Access, type Agent } from "./keys";

const instructions = `Acta is a project manager. Work lives on boards, named "workspace/board". Each task has an id made of the board's prefix and a number, like ACT-12. A task moves todo → in_progress → review → done. Work that was dropped, such as a GitHub issue closed as not planned, goes to canceled.

How to work with it:
1. Find the board for the project you're in. Look for a line like "Acta board: workspace/board" in AGENTS.md, CLAUDE.md or the README. If there isn't one, call list_boards, ask the person which board to use, and offer to add that line. search_tasks looks across every board at once, for example for what's assigned to "me".
2. Before starting something, check list_tasks for a task that already covers it. Create one if there's none.
3. When you start a task, move it to in_progress and assign it to "me". Tick subtasks as you finish them. Keep one progress comment per task and update it with edit_comment, adding a new comment only for a milestone, a blocker or a question.
4. When the work is ready for someone to look at, such as an open pull request, move it to review and comment with the link. Move it to done once it's merged or shipped.
5. If get_board lists github_repositories, work in the branch get_task gives (like act-12-add-csv-export) and say "Fixes ACT-12" in the pull request's description. Acta then links it, moves the task along and marks it done on merge by itself, so leave those moves to it and don't comment the link. For work that didn't name the task, link_github links it by its address. Where a repository's issues sync, they arrive as tasks on their own: don't create tasks for them, and open_github_issue turns a task into an issue.
6. If you delete a task by mistake, restore_task brings it back. To tidy finished work away without deleting it, archive it; list_tasks with archived: true finds it again.
7. When bringing work over from another tracker, keep its history: give create_tasks each task's created time, the time finished or dropped work closed, a shipped date for finished work, and its comments with their original author and time.

Write titles as short imperatives ("Add CSV export") and descriptions in Markdown. Everything you do shows up live on the board, credited to the person who made this key and marked with the key's name. When you mention a task to the person, include its url.`;

const board = z.string().describe('The board, as "workspace/board" from list_boards. A board URL works too.');
const task = z.string().describe('The task id, like "ACT-12". The number alone works too.');
const status = z.enum(taskStatuses);
const priority = z.enum(["urgent", "high", "medium", "low", "none"]);
const size = z.enum(["xs", "s", "m", "l", "xl"]);
const date = z.string().describe("A date, YYYY-MM-DD");
const moment = z.string().describe("When it happened: a date, YYYY-MM-DD, or a time like 2026-11-02T14:30:00Z");
const tone = z.enum(["lapis", "pyrite", "malachite", "hematite"]);
const githubUrl = z.string().url().describe("Its address on github.com, like https://github.com/acme/app/pull/45");
const comment = {
  body: z.string().min(1).max(10000).describe("Markdown"),
  author: z
    .string()
    .min(1)
    .max(60)
    .optional()
    .describe("Who wrote it, when it comes from somewhere else such as a GitHub issue. Leave it out for your own comments"),
  at: moment.optional().describe("When it was written, for comments from somewhere else. Defaults to now"),
};

const fields = {
  title: z.string().min(1).max(500),
  description: z.string().max(20000).describe("Markdown"),
  status: status.describe("Where the task is. Defaults to todo."),
  priority,
  size: size.nullable().describe("Rough effort, from xs to xl. null clears it."),
  project: z.string().nullable().describe("One of the board's projects. null clears it."),
  labels: z.array(z.string()).max(20).describe("Labels from the board's list, replacing the current ones"),
  assignee: z.string().nullable().describe('"me", or a person\'s name from get_board. null unassigns.'),
  start: date.nullable().describe("Start date, YYYY-MM-DD. null clears it."),
  due: date.nullable().describe("Due date, YYYY-MM-DD. null clears it."),
  public: z.boolean().describe("Show it on the board's public roadmap"),
  fields: z
    .record(z.string(), z.union([z.string(), z.number(), z.array(z.string()), z.null()]))
    .describe(
      "The board's own fields by name (see get_board), like {\"Customer\": \"Acme\", \"Effort\": 3}. Select fields take one of their options, multi selects a list. null clears one",
    ),
};

// Everything update_task can change, shared with update_tasks
const changes = {
  ...z.object(fields).partial().shape,
  shipped: date.nullable().optional().describe("When a done task shipped, YYYY-MM-DD. Moving to done sets today"),
  archived: z
    .boolean()
    .optional()
    .describe("true puts the task in the archive: off the board, not deleted, still on the public roadmap. false brings it back"),
  add_labels: z.array(z.string()).optional(),
  remove_labels: z.array(z.string()).optional(),
  add_subtasks: z.array(z.string().min(1).max(200)).max(50).optional(),
  complete_subtasks: z.array(z.string()).optional().describe("Subtask ids or titles to tick"),
  reopen_subtasks: z.array(z.string()).optional().describe("Subtask ids or titles to untick"),
  rename_subtasks: z
    .array(z.object({ subtask: z.string().describe("Its id or current title"), title: z.string().min(1).max(200) }))
    .optional(),
  remove_subtasks: z.array(z.string()).optional().describe("Subtask ids or titles to remove"),
  place: z.enum(["top", "bottom"]).optional().describe("Move the card to the top or bottom of its column"),
  before: task.optional().describe("Put the card just above this task, which must be in the same column"),
  after: task.optional().describe("Put the card just below this task, which must be in the same column"),
};

function reply(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function failure(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

// Mistakes the agent can fix come back as tool errors it can read. Anything else is logged
function run(work: (args: unknown) => Promise<unknown>) {
  return async (args: unknown) => {
    try {
      return reply(await work(args));
    } catch (error) {
      if (error instanceof Problem) return failure(error.message);
      console.error("MCP tool failed", error);
      return failure("Acta couldn’t do that just now. Try again in a moment.");
    }
  };
}

// The MCP SDK works out a tool's JSON Schema each time a server lists the tools or runs one, and every request has
// a server of its own. The schemas below are made once for the whole process, so each keeps its JSON Schema once
// it's been worked out. The SDK only reads what it's handed, so one copy can go to every request
function keepJson<S extends z.ZodObject>(schema: S): S {
  const standard = schema["~standard"];
  const made = new Map<string, Record<string, unknown>>();
  const convert =
    (io: "input" | "output") =>
    (options: Parameters<typeof standard.jsonSchema.input>[0]) => {
      const key = `${io} ${JSON.stringify(options)}`;
      if (!made.has(key)) made.set(key, standard.jsonSchema[io](options));
      return made.get(key)!;
    };
  schema["~standard"] = { ...standard, jsonSchema: { input: convert("input"), output: convert("output") } };
  return schema;
}

const reads = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

/** A tool as the HTTP API sees it: what it takes, whether it only reads, and the work it does */
export type Tool = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  readOnly: boolean;
  work: (args: unknown) => Promise<unknown>;
};

// A tool, made once for the whole process. need is the access a key needs to see it, and github marks the ones
// that only exist where GitHub is set up
type Definition = {
  name: string;
  need: Access;
  github: boolean;
  config: { title: string; description: string; inputSchema?: z.ZodObject; annotations: ToolAnnotations };
  // What the HTTP API checks arguments against. Tools that take nothing have no schema over MCP, and an empty one here
  input: z.ZodObject;
  inputJson: () => unknown;
  work: (acta: Acta, args: unknown) => Promise<unknown>;
};

function define<S extends z.ZodObject = z.ZodObject<Record<never, never>>>(
  d: {
    name: string;
    need?: Access;
    github?: boolean;
    title: string;
    description: string;
    inputSchema?: S;
    annotations: ToolAnnotations;
  },
  work: (acta: Acta, args: z.output<S>) => Promise<unknown>,
): Definition {
  const input = d.inputSchema ? keepJson(d.inputSchema) : z.object({});
  let json: unknown;
  return {
    name: d.name,
    need: d.need ?? "read",
    github: d.github ?? false,
    config: { title: d.title, description: d.description, inputSchema: d.inputSchema, annotations: d.annotations },
    input,
    inputJson: () => (json ??= z.toJSONSchema(input, { io: "input" })),
    work: work as Definition["work"],
  };
}

const definitions: Definition[] = [
  define(
    {
      name: "list_boards",
      title: "List boards",
      description:
        "Start here. Lists every workspace and board this key can reach, with each board's ref, task prefix and number of open tasks.",
      annotations: reads,
    },
    (acta) => acta.overview(),
  ),

  define(
    {
      name: "get_board",
      title: "Get a board",
      description:
        "A board's labels, projects, its own fields, people, task counts per status and public roadmap settings. Use it to learn the valid labels, projects, fields and assignees before creating tasks.",
      inputSchema: z.object({ board }),
      annotations: reads,
    },
    (acta, { board }) => acta.board(board),
  ),

  define(
    {
      name: "list_tasks",
      title: "List tasks",
      description:
        "Tasks on a board, in board order, as short summaries, with their pull request's state, checks and review on boards linked to GitHub. Shows open tasks (todo, in_progress, review) unless you pass status. Use get_task for a task's description, subtasks and comments.",
      inputSchema: z.object({
        board,
        status: z
          .array(status)
          .optional()
          .describe('Only these statuses. Pass ["done"] for finished work, ["canceled"] for dropped work.'),
        assignee: z.string().optional().describe('"me", or a person\'s name'),
        label: z.string().optional(),
        project: z.string().optional(),
        query: z.string().optional().describe("Words to find in titles and descriptions, or a task id"),
        deleted: z.boolean().optional().describe("Show deleted tasks instead, newest first, to find one to restore"),
        archived: z.boolean().optional().describe("Show archived tasks instead, in every status unless you pass status"),
        github: z
          .enum(githubFilters)
          .optional()
          .describe("On boards linked to GitHub, only tasks with an open pull request, with failing checks, or with none"),
        limit: z.number().int().min(1).max(200).optional().describe("Defaults to 50"),
      }),
      annotations: reads,
    },
    (acta, { board, ...filters }) => acta.tasks(board, filters),
  ),

  define(
    {
      name: "search_tasks",
      title: "Search every board",
      description:
        "Finds tasks across every board this key can reach, most recently changed first, each with its board. Shows open tasks unless you pass status. Use it for \"what's assigned to me?\" or when you don't know which board a task is on.",
      inputSchema: z.object({
        query: z.string().optional().describe("Words to find in titles and descriptions, or a task id like ACT-12"),
        assignee: z.string().optional().describe('"me", or a person\'s name'),
        status: z.array(status).optional().describe("Only these statuses"),
        github: z
          .enum(githubFilters)
          .optional()
          .describe("On boards linked to GitHub, only tasks with an open pull request, with failing checks, or with none"),
        limit: z.number().int().min(1).max(200).optional().describe("Defaults to 50"),
      }),
      annotations: reads,
    },
    (acta, filters) => acta.searchAll(filters),
  ),

  define(
    {
      name: "get_task",
      title: "Get a task",
      description:
        "Everything about one task: description, subtasks, comments, recent activity and its link. On boards linked to GitHub, also its pull requests, issue, branches and commits, and the branch name to work in.",
      inputSchema: z.object({ board, task }),
      annotations: reads,
    },
    (acta, { board, task }) => acta.task(board, task),
  ),

  define(
    {
      name: "list_suggestions",
      title: "List roadmap suggestions",
      description:
        "Ideas people sent in through the board's public roadmap, most voted first. Pass declined to see the ones that were turned down instead, newest first, with who declined each.",
      inputSchema: z.object({
        board,
        declined: z.boolean().optional().describe("Show declined ideas instead"),
      }),
      annotations: reads,
    },
    (acta, { board, declined }) => acta.suggestions(board, declined),
  ),

  define(
    {
      name: "list_activity",
      title: "List recent activity",
      description:
        "What happened on a board lately, newest first: tasks created, moved, assigned, commented on and so on, with who did it and when. Use it to catch up on a board.",
      inputSchema: z.object({
        board,
        since: moment.optional().describe("Only what happened after this"),
        limit: z.number().int().min(1).max(200).optional().describe("Defaults to 50"),
      }),
      annotations: reads,
    },
    (acta, { board, ...filters }) => acta.activity(board, filters),
  ),

  define(
    {
      name: "create_tasks",
      need: "write",
      title: "Create tasks",
      description:
        "Adds one or more tasks to a board, at the bottom of their column. Labels, project and assignee must match the board (see get_board). Tasks go on the public roadmap when public is true, or when it's left out and the board's new_tasks_public setting is on. To bring work over from another tracker, pass created, closed, shipped and comments so its history stays. Returns the new ids and links.",
      inputSchema: z.object({
        board,
        tasks: z
          .array(
            z.object({
              ...fields,
              size: size.optional(),
              project: z.string().optional().describe("One of the board's projects"),
              labels: fields.labels.optional().describe("Labels from the board's list"),
              assignee: z.string().optional().describe('"me", or a person\'s name from get_board'),
              start: date.optional(),
              due: date.optional(),
              description: fields.description.optional(),
              status: fields.status.optional(),
              priority: priority.optional(),
              fields: fields.fields.optional(),
              public: fields.public
                .optional()
                .describe("Show it on the public roadmap. Defaults to the board's new_tasks_public setting"),
              subtasks: z.array(z.string().min(1).max(200)).max(50).optional().describe("Checklist items"),
              created: moment.optional().describe("When the task was first made, if somewhere else. Defaults to now"),
              closed: moment
                .optional()
                .describe(
                  "When a done or canceled task was closed, if somewhere else, ideally to the minute. With it the board can say how long the work took. Defaults to now for tasks made today, and to unknown for older ones",
                ),
              shipped: date
                .optional()
                .describe("When a done task shipped, YYYY-MM-DD. Defaults to the day it closed, or today"),
              comments: z
                .array(z.object(comment))
                .max(100)
                .optional()
                .describe("Comments to bring over with the task, oldest first"),
            }),
          )
          .min(1)
          .max(50),
      }),
      annotations: writes,
    },
    (acta, { board, tasks }) => acta.createTasks(board, tasks),
  ),

  define(
    {
      name: "update_task",
      need: "write",
      title: "Update a task",
      description:
        "Changes a task. Only the fields you pass change. Set status to move it between columns, assignee \"me\" to take it, and use the subtask fields to work through its checklist. place, before or after moves the card within its column, so you can put the most important work at the top. Each change is logged on the task.",
      inputSchema: z.object({ board, task, ...changes }),
      annotations: { ...writes, idempotentHint: true },
    },
    (acta, { board, task, ...patch }) => acta.updateTask(board, task, patch),
  ),

  define(
    {
      name: "update_tasks",
      need: "write",
      title: "Update several tasks",
      description:
        "Changes many tasks in one call, each with the same fields as update_task. Tasks are changed in order; one that can't change is reported under failed and the rest still go through.",
      inputSchema: z.object({
        board,
        tasks: z
          .array(z.object({ task, ...changes }))
          .min(1)
          .max(50),
      }),
      annotations: { ...writes, idempotentHint: true },
    },
    (acta, { board, tasks }) => acta.updateTasks(board, tasks),
  ),

  define(
    {
      name: "sort_column",
      need: "write",
      title: "Sort a column",
      description:
        "Reorders the cards in one status column for everyone. Pass by to sort it, for example by priority with the most urgent on top, or tasks to put those tasks at the top in that order with the rest keeping theirs below.",
      inputSchema: z.object({
        board,
        status,
        by: z
          .enum(sortKeys)
          .optional()
          .describe(
            "priority: urgent first. due and start: soonest first. created: oldest first. updated: latest first. size: smallest first. title: A to Z. votes: most first. Tasks without a value go last",
          ),
        reverse: z.boolean().optional().describe("Flip the order of by"),
        tasks: z.array(task).max(200).optional().describe("Task ids, top to bottom"),
      }),
      annotations: { ...writes, idempotentHint: true },
    },
    (acta, { board, ...p }) => acta.sortColumn(board, p),
  ),

  define(
    {
      name: "add_comment",
      need: "write",
      title: "Comment on a task",
      description:
        "Adds a Markdown comment to a task, for progress notes, blockers, questions or links. A comment from somewhere else, such as a GitHub issue, can keep its author and time. Returns the comment's id, for edit_comment.",
      inputSchema: z.object({ board, task, ...comment }),
      annotations: writes,
    },
    (acta, { board, task, ...c }) => acta.comment(board, task, c),
  ),

  define(
    {
      name: "edit_comment",
      need: "write",
      title: "Edit a comment",
      description:
        "Replaces the text of a comment this key wrote, such as a running progress note. Other people's comments, and comments from other keys, can't be edited. get_task marks yours.",
      inputSchema: z.object({
        board,
        comment: z.string().describe("The comment's id, from add_comment or get_task"),
        body: z.string().min(1).max(10000),
      }),
      annotations: { ...writes, idempotentHint: true },
    },
    (acta, { board, comment, body }) => acta.editComment(board, comment, body),
  ),

  define(
    {
      name: "restore_task",
      need: "write",
      title: "Restore a deleted task",
      description:
        "Brings back a deleted task with its id, comments and history, at the bottom of its column. list_tasks with deleted: true shows what can be restored.",
      inputSchema: z.object({ board, task }),
      annotations: { ...writes, idempotentHint: true },
    },
    (acta, { board, task }) => acta.restoreTask(board, task),
  ),

  define(
    {
      name: "delete_task",
      need: "write",
      title: "Delete a task",
      description:
        "Removes a task from the board. Only for tasks created by mistake or duplicates. Finished work should be moved to done instead. restore_task undoes it.",
      inputSchema: z.object({ board, task }),
      annotations: { ...writes, destructiveHint: true, idempotentHint: true },
    },
    (acta, { board, task }) => acta.deleteTask(board, task),
  ),

  define(
    {
      name: "link_github",
      need: "write",
      github: true,
      title: "Link GitHub work to a task",
      description:
        "Links a pull request, issue, branch or commit to a task by its address, for work that doesn't name the task id. The repository must be linked to the board (see get_board). A pull request, branch or commit moves the task along as if it had named it. Linking an issue makes the task sync with it.",
      inputSchema: z.object({ board, task, url: githubUrl }),
      annotations: { ...writes, idempotentHint: true, openWorldHint: true },
    },
    (acta, { board, task, url }) => acta.linkGitHub(board, task, url),
  ),

  define(
    {
      name: "unlink_github",
      need: "write",
      github: true,
      title: "Unlink GitHub work from a task",
      description: "Takes a linked pull request, issue, branch or commit off a task. Nothing changes on GitHub.",
      inputSchema: z.object({ board, task, url: githubUrl }),
      annotations: { ...writes, idempotentHint: true },
    },
    (acta, { board, task, url }) => acta.unlinkGitHub(board, task, url),
  ),

  define(
    {
      name: "open_github_issue",
      need: "write",
      github: true,
      title: "Open a GitHub issue from a task",
      description:
        "Opens an issue with the task's title, description and labels in a repository whose issues sync with the board, and keeps the two in step from then on. Returns the issue's address.",
      inputSchema: z.object({
        board,
        task,
        repository: z
          .string()
          .optional()
          .describe('Like "acme/app". Leave it out when only one of the board’s repositories syncs issues'),
      }),
      annotations: { ...writes, openWorldHint: true },
    },
    (acta, { board, task, repository }) => acta.openGitHubIssue(board, task, repository),
  ),

  define(
    {
      name: "create_board",
      need: "manage",
      title: "Create a board",
      description: "Adds a board to a workspace. Its task prefix comes from the name.",
      inputSchema: z.object({
        workspace: z.string().describe("The workspace's slug, from list_boards"),
        name: z.string().min(1).max(60),
      }),
      annotations: writes,
    },
    (acta, { workspace, name }) => acta.createBoard(workspace, name),
  ),

  define(
    {
      name: "update_board",
      need: "manage",
      title: "Update a board",
      description:
        "Renames a board, or adds, renames, recolours and removes its labels and projects. Renaming a label or project renames it on every task that has it. Also adds, renames and removes the board's own fields, and renames its statuses.",
      inputSchema: z.object({
        board,
        name: z.string().min(1).max(60).optional(),
        icon: z.enum(boardIcons).optional().describe("The board's icon in the sidebar"),
        add_labels: z.array(z.object({ name: z.string().min(1).max(40), tone: tone.optional() })).optional(),
        update_labels: z
          .array(
            z.object({
              label: z.string().describe("The label's current name"),
              name: z.string().min(1).max(40).optional().describe("Its new name"),
              tone: tone.optional(),
            }),
          )
          .optional(),
        remove_labels: z.array(z.string()).optional(),
        add_projects: z.array(z.object({ name: z.string().min(1).max(40), tone: tone.optional() })).optional(),
        update_projects: z
          .array(
            z.object({
              project: z.string().describe("The project's current name"),
              name: z.string().min(1).max(40).optional().describe("Its new name"),
              tone: tone.optional(),
            }),
          )
          .optional(),
        remove_projects: z.array(z.string()).optional(),
        add_fields: z
          .array(
            z.object({
              name: z.string().min(1).max(40),
              type: z.enum(["text", "number", "date", "select", "multi"]),
              options: z.array(z.string().min(1).max(40)).max(50).optional().describe("For select and multi fields"),
            }),
          )
          .optional(),
        update_fields: z
          .array(
            z.object({
              field: z.string().describe("The field's current name"),
              name: z.string().min(1).max(40).optional().describe("Its new name"),
              options: z.array(z.string().min(1).max(40)).max(50).optional().describe("Its options, replacing them"),
            }),
          )
          .optional(),
        remove_fields: z.array(z.string()).optional().describe("Fields to remove. Their values are hidden"),
        status_names: z
          .partialRecord(status, z.string().max(30).nullable())
          .optional()
          .describe('What the board calls each status, like {"review": "QA"}. null puts the usual name back'),
      }),
      annotations: writes,
    },
    (acta, { board, ...patch }) => acta.updateBoard(board, patch),
  ),

  define(
    {
      name: "update_roadmap",
      need: "manage",
      title: "Update the public roadmap",
      description:
        "Publishes or hides a board's public roadmap and sets its title, introduction, voting, whether visitors can send ideas and whether new tasks go on it. Tasks appear on it when their public field is true.",
      inputSchema: z.object({
        board,
        public: z.boolean().optional(),
        title: z.string().max(80).optional(),
        tagline: z.string().max(400).optional().describe("The introduction under the title"),
        voting: z.boolean().optional(),
        ideas: z.boolean().optional().describe("Let visitors send ideas"),
        new_tasks_public: z
          .boolean()
          .optional()
          .describe("Put new tasks on the roadmap unless they say otherwise. Applies to people and agents"),
        hide_from_search: z
          .boolean()
          .optional()
          .describe("Keep the published page out of search engines, for one only shared by link"),
      }),
      annotations: { ...writes, idempotentHint: true },
    },
    (acta, { board, ...patch }) => acta.updateRoadmap(board, patch),
  ),

  define(
    {
      name: "review_suggestion",
      need: "manage",
      title: "Accept or decline a suggestion",
      description:
        "Accepting turns a roadmap suggestion into a public todo task and carries its votes over. Declining removes it.",
      inputSchema: z.object({
        board,
        suggestion: z.string().describe("The suggestion's id, from list_suggestions"),
        accept: z.boolean(),
      }),
      annotations: { ...writes, destructiveHint: true },
    },
    (acta, { board, suggestion, accept }) => acta.reviewSuggestion(board, suggestion, accept),
  ),
];

// The tools on this server at all, and the ones a key's access lets it use, in the order they're listed
const offered = (d: Definition) => !d.github || githubReady;
const allowed = (agent: Agent) => definitions.filter((d) => offered(d) && accessRank[agent.access] >= accessRank[d.need]);

export function actaServer(agent: Agent) {
  const server = new McpServer({ name: "acta", title: "Acta", version: "1.0.0" }, { instructions });
  const acta = actaFor(agent);
  // define typed each tool's work against its own schema. A list of every tool can't carry those types, so the SDK
  // gets them without
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: Definition["config"],
    callback: (args: unknown) => Promise<unknown>,
  ) => void;
  for (const d of allowed(agent)) register(d.name, d.config, run((args) => d.work(acta, args)));
  return server;
}

function asTool(d: Definition, acta: () => Acta): Tool & { inputJson: () => unknown } {
  return {
    name: d.name,
    title: d.config.title,
    description: d.config.description,
    input: d.input,
    readOnly: Boolean(d.config.annotations.readOnlyHint),
    inputJson: d.inputJson,
    work: (args) => d.work(acta(), args),
  };
}

/** The tools a key may use, the same ones its MCP server has */
export function actaTools(agent: Agent) {
  let acta: Acta | undefined;
  return allowed(agent).map((d) => asTool(d, () => (acta ??= actaFor(agent))));
}

/** One tool by name for this key, "forbidden" when the key's access doesn't reach it, or null when there's none */
export function actaTool(agent: Agent, name: string) {
  const d = definitions.find((x) => x.name === name && offered(x));
  if (!d) return null;
  if (accessRank[agent.access] < accessRank[d.need]) return "forbidden" as const;
  return asTool(d, () => actaFor(agent));
}
