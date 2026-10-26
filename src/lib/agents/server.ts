import "server-only";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import { actaFor, Problem, taskStatuses } from "./acta";
import type { Agent } from "./keys";

const instructions = `Acta is a project manager. Work lives on boards, named "workspace/board". Each task has an id made of the board's prefix and a number, like ACT-12. A task moves todo → in_progress → review → done.

How to work with it:
1. Find the board for the project you're in. Look for a line like "Acta board: workspace/board" in AGENTS.md, CLAUDE.md or the README. If there isn't one, call list_boards, ask the person which board to use, and offer to add that line. search_tasks looks across every board at once, for example for what's assigned to "me".
2. Before starting something, check list_tasks for a task that already covers it. Create one if there's none.
3. When you start a task, move it to in_progress and assign it to "me". Tick subtasks as you finish them. Keep one progress comment per task and update it with edit_comment, adding a new comment only for a milestone, a blocker or a question.
4. When the work is ready for someone to look at, such as an open pull request, move it to review and comment with the link. Move it to done once it's merged or shipped.
5. If you delete a task by mistake, restore_task brings it back.

Write titles as short imperatives ("Add CSV export") and descriptions in Markdown. Everything you do shows up live on the board, credited to the person who made this key and marked with the key's name. When you mention a task to the person, include its url.`;

const board = z.string().describe('The board, as "workspace/board" from list_boards. A board URL works too.');
const task = z.string().describe('The task id, like "ACT-12". The number alone works too.');
const status = z.enum(taskStatuses);
const priority = z.enum(["urgent", "high", "medium", "low", "none"]);
const size = z.enum(["xs", "s", "m", "l", "xl"]);
const date = z.string().describe("A date, YYYY-MM-DD");
const tone = z.enum(["lapis", "pyrite", "malachite", "hematite"]);

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
};

function reply(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function failure(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

// Mistakes the agent can fix come back as tool errors it can read. Anything else is logged
function run<A>(work: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return reply(await work(args));
    } catch (error) {
      if (error instanceof Problem) return failure(error.message);
      console.error("MCP tool failed", error);
      return failure("Acta couldn’t do that just now. Try again in a moment.");
    }
  };
}

const reads = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

export function actaServer(agent: Agent) {
  const acta = actaFor(agent);
  const server = new McpServer({ name: "acta", title: "Acta", version: "1.0.0" }, { instructions });

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
        "A board's labels, projects, people, task counts per status and public roadmap settings. Use it to learn the valid labels, projects and assignees before creating tasks.",
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
        status: z.array(status).optional().describe("Only these statuses. Pass [\"done\"] for finished work."),
        assignee: z.string().optional().describe('"me", or a person\'s name'),
        label: z.string().optional(),
        project: z.string().optional(),
        query: z.string().optional().describe("Words to find in titles and descriptions, or a task id"),
        deleted: z.boolean().optional().describe("Show deleted tasks instead, newest first, to find one to restore"),
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
      description: "Ideas people sent in through the board's public roadmap, most voted first.",
      inputSchema: z.object({ board }),
      annotations: reads,
    },
    run(({ board }) => acta.suggestions(board)),
  );

  if (acta.can("write")) {
    server.registerTool(
      "create_tasks",
      {
        title: "Create tasks",
        description:
          "Adds one or more tasks to a board, at the bottom of their column. Labels, project and assignee must match the board (see get_board). Returns the new ids and links.",
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
                public: fields.public
                  .optional()
                  .describe("Show it on the public roadmap. Defaults to the board's new_tasks_public setting"),
                subtasks: z.array(z.string().min(1).max(200)).max(50).optional().describe("Checklist items"),
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
        inputSchema: z
          .object({ board, task })
          .extend(z.object(fields).partial().shape)
          .extend({
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
          }),
        annotations: { ...writes, idempotentHint: true },
      },
      run(({ board, task, ...patch }) => acta.updateTask(board, task, patch)),
    );

    server.registerTool(
      "add_comment",
      {
        title: "Comment on a task",
        description:
          "Adds a Markdown comment to a task, for progress notes, blockers, questions or links. Returns the comment's id, for edit_comment.",
        inputSchema: z.object({ board, task, body: z.string().min(1).max(10000) }),
        annotations: writes,
      },
      run(({ board, task, body }) => acta.comment(board, task, body)),
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
        description: "Renames a board, or adds and removes its labels and projects.",
        inputSchema: z.object({
          board,
          name: z.string().min(1).max(60).optional(),
          add_labels: z.array(z.object({ name: z.string().min(1).max(40), tone: tone.optional() })).optional(),
          remove_labels: z.array(z.string()).optional(),
          add_projects: z.array(z.object({ name: z.string().min(1).max(40), tone: tone.optional() })).optional(),
          remove_projects: z.array(z.string()).optional(),
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

  return server;
}
