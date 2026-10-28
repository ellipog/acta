import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { boardIcons } from "@/lib/board-icons";
import { actaFor, Problem, sortKeys, taskStatuses } from "./acta";
import type { Agent } from "./keys";

const instructions = `Acta is a project manager. Work lives on boards, named "workspace/board". Each task has an id made of the board's prefix and a number, like ACT-12. A task moves todo → in_progress → review → done. Work that was dropped, such as a GitHub issue closed as not planned, goes to canceled.

How to work with it:
1. Find the board for the project you're in. Look for a line like "Acta board: workspace/board" in AGENTS.md, CLAUDE.md or the README. If there isn't one, call list_boards, ask the person which board to use, and offer to add that line. search_tasks looks across every board at once, for example for what's assigned to "me".
2. Before starting something, check list_tasks for a task that already covers it. Create one if there's none.
3. When you start a task, move it to in_progress and assign it to "me". Tick subtasks as you finish them. Keep one progress comment per task and update it with edit_comment, adding a new comment only for a milestone, a blocker or a question.
4. When the work is ready for someone to look at, such as an open pull request, move it to review and comment with the link. Move it to done once it's merged or shipped.
5. If you delete a task by mistake, restore_task brings it back. To tidy finished work away without deleting it, archive it; list_tasks with archived: true finds it again.
6. When bringing work over from another tracker, keep its history: give create_tasks each task's created date, a shipped date for finished work, and its comments with their original author and time.

Write titles as short imperatives ("Add CSV export") and descriptions in Markdown. Everything you do shows up live on the board, credited to the person who made this key and marked with the key's name. When you mention a task to the person, include its url.`;

const board = z.string().describe('The board, as "workspace/board" from list_boards. A board URL works too.');
const task = z.string().describe('The task id, like "ACT-12". The number alone works too.');
const status = z.enum(taskStatuses);
const priority = z.enum(["urgent", "high", "medium", "low", "none"]);
const size = z.enum(["xs", "s", "m", "l", "xl"]);
const date = z.string().describe("A date, YYYY-MM-DD");
const moment = z.string().describe("When it happened: a date, YYYY-MM-DD, or a time like 2026-11-02T14:30:00Z");
const tone = z.enum(["lapis", "pyrite", "malachite", "hematite"]);
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

// Mistakes the agent can fix come back as tool errors it can read. Anything else is logged. The work itself rides
// along, so the HTTP API can run the same tool and answer in its own way
function run<A>(work: (args: A) => Promise<unknown>) {
  return Object.assign(
    async (args: A) => {
      try {
        return reply(await work(args));
      } catch (error) {
        if (error instanceof Problem) return failure(error.message);
        console.error("MCP tool failed", error);
        return failure("Acta couldn’t do that just now. Try again in a moment.");
      }
    },
    { work },
  );
}

const reads = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

type Registrar = Pick<McpServer, "registerTool">;

export function actaServer(agent: Agent) {
  const server = new McpServer({ name: "acta", title: "Acta", version: "1.0.0" }, { instructions });
  addTools(server, agent);
  return server;
}

/** A tool as the HTTP API sees it: what it takes, whether it only reads, and the work it does */
export type Tool = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  readOnly: boolean;
  work: (args: unknown) => Promise<unknown>;
};

/** The tools a key may use, the same ones its MCP server has */
export function actaTools(agent: Agent): Tool[] {
  const tools: Tool[] = [];
  const registerTool = ((name: string, config: Parameters<McpServer["registerTool"]>[1], callback: unknown) => {
    tools.push({
      name,
      title: config.title ?? name,
      description: config.description ?? "",
      input: (config.inputSchema as z.ZodObject | undefined) ?? z.object({}),
      readOnly: Boolean(config.annotations?.readOnlyHint),
      work: (callback as { work: Tool["work"] }).work,
    });
  }) as unknown as Registrar["registerTool"];
  addTools({ registerTool }, agent);
  return tools;
}

function addTools(server: Registrar, agent: Agent) {
  const acta = actaFor(agent);

  server.registerTool(
    "list_boards",
    {
      title: "List boards",
      description:
        "Start here. Lists every workspace and board this key can reach, with each board's ref, task prefix and number of open tasks.",
      annotations: reads,
    },
    run(() => acta.overview()),
  );

  server.registerTool(
    "get_board",
    {
      title: "Get a board",
      description:
        "A board's labels, projects, its own fields, people, task counts per status and public roadmap settings. Use it to learn the valid labels, projects, fields and assignees before creating tasks.",
      inputSchema: z.object({ board }),
      annotations: reads,
    },
    run(({ board }) => acta.board(board)),
  );

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "Tasks on a board, in board order, as short summaries. Shows open tasks (todo, in_progress, review) unless you pass status. Use get_task for a task's description, subtasks and comments.",
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
        limit: z.number().int().min(1).max(200).optional().describe("Defaults to 50"),
      }),
      annotations: reads,
    },
    run(({ board, ...filters }) => acta.tasks(board, filters)),
  );

  server.registerTool(
    "search_tasks",
    {
      title: "Search every board",
      description:
        "Finds tasks across every board this key can reach, most recently changed first, each with its board. Shows open tasks unless you pass status. Use it for \"what's assigned to me?\" or when you don't know which board a task is on.",
      inputSchema: z.object({
        query: z.string().optional().describe("Words to find in titles and descriptions, or a task id like ACT-12"),
        assignee: z.string().optional().describe('"me", or a person\'s name'),
        status: z.array(status).optional().describe("Only these statuses"),
        limit: z.number().int().min(1).max(200).optional().describe("Defaults to 50"),
      }),
      annotations: reads,
    },
    run((filters) => acta.searchAll(filters)),
  );

  server.registerTool(
    "get_task",
    {
      title: "Get a task",
      description: "Everything about one task: description, subtasks, comments, recent activity and its link.",
      inputSchema: z.object({ board, task }),
      annotations: reads,
    },
    run(({ board, task }) => acta.task(board, task)),
  );

  server.registerTool(
    "list_suggestions",
    {
      title: "List roadmap suggestions",
      description:
        "Ideas people sent in through the board's public roadmap, most voted first. Pass declined to see the ones that were turned down instead, newest first, with who declined each.",
      inputSchema: z.object({
        board,
        declined: z.boolean().optional().describe("Show declined ideas instead"),
      }),
      annotations: reads,
    },
    run(({ board, declined }) => acta.suggestions(board, declined)),
  );

  server.registerTool(
    "list_activity",
    {
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
    run(({ board, ...filters }) => acta.activity(board, filters)),
  );

  if (acta.can("write")) {
    server.registerTool(
      "create_tasks",
      {
        title: "Create tasks",
        description:
          "Adds one or more tasks to a board, at the bottom of their column. Labels, project and assignee must match the board (see get_board). Tasks go on the public roadmap when public is true, or when it's left out and the board's new_tasks_public setting is on. To bring work over from another tracker, pass created, shipped and comments so its history stays. Returns the new ids and links.",
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
                shipped: date.optional().describe("When a done task shipped, YYYY-MM-DD. Defaults to today for done tasks"),
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
      run(({ board, tasks }) => acta.createTasks(board, tasks)),
    );

    server.registerTool(
      "update_task",
      {
        title: "Update a task",
        description:
          "Changes a task. Only the fields you pass change. Set status to move it between columns, assignee \"me\" to take it, and use the subtask fields to work through its checklist. place, before or after moves the card within its column, so you can put the most important work at the top. Each change is logged on the task.",
        inputSchema: z.object({ board, task, ...changes }),
        annotations: { ...writes, idempotentHint: true },
      },
      run(({ board, task, ...patch }) => acta.updateTask(board, task, patch)),
    );

    server.registerTool(
      "update_tasks",
      {
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
      run(({ board, tasks }) => acta.updateTasks(board, tasks)),
    );

    server.registerTool(
      "sort_column",
      {
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
      run(({ board, ...p }) => acta.sortColumn(board, p)),
    );

    server.registerTool(
      "add_comment",
      {
        title: "Comment on a task",
        description:
          "Adds a Markdown comment to a task, for progress notes, blockers, questions or links. A comment from somewhere else, such as a GitHub issue, can keep its author and time. Returns the comment's id, for edit_comment.",
        inputSchema: z.object({ board, task, ...comment }),
        annotations: writes,
      },
      run(({ board, task, ...c }) => acta.comment(board, task, c)),
    );

    server.registerTool(
      "edit_comment",
      {
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
      run(({ board, comment, body }) => acta.editComment(board, comment, body)),
    );

    server.registerTool(
      "restore_task",
      {
        title: "Restore a deleted task",
        description:
          "Brings back a deleted task with its id, comments and history, at the bottom of its column. list_tasks with deleted: true shows what can be restored.",
        inputSchema: z.object({ board, task }),
        annotations: { ...writes, idempotentHint: true },
      },
      run(({ board, task }) => acta.restoreTask(board, task)),
    );

    server.registerTool(
      "delete_task",
      {
        title: "Delete a task",
        description:
          "Removes a task from the board. Only for tasks created by mistake or duplicates. Finished work should be moved to done instead. restore_task undoes it.",
        inputSchema: z.object({ board, task }),
        annotations: { ...writes, destructiveHint: true, idempotentHint: true },
      },
      run(({ board, task }) => acta.deleteTask(board, task)),
    );
  }

  if (acta.can("manage")) {
    server.registerTool(
      "create_board",
      {
        title: "Create a board",
        description: "Adds a board to a workspace. Its task prefix comes from the name.",
        inputSchema: z.object({
          workspace: z.string().describe("The workspace's slug, from list_boards"),
          name: z.string().min(1).max(60),
        }),
        annotations: writes,
      },
      run(({ workspace, name }) => acta.createBoard(workspace, name)),
    );

    server.registerTool(
      "update_board",
      {
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
      run(({ board, ...patch }) => acta.updateBoard(board, patch)),
    );

    server.registerTool(
      "update_roadmap",
      {
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
        }),
        annotations: { ...writes, idempotentHint: true },
      },
      run(({ board, ...patch }) => acta.updateRoadmap(board, patch)),
    );

    server.registerTool(
      "review_suggestion",
      {
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
      run(({ board, suggestion, accept }) => acta.reviewSuggestion(board, suggestion, accept)),
    );
  }
}
