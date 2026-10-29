import { siteUrl } from "./slugs";

// Acta's docs, written once in Markdown: the /docs pages show them, and /llms-full.txt hands them to AI tools as
// they are. "## " starts a section with its own anchor

export type DocPage = {
  slug: string;
  // In the sidebar
  nav: string;
  title: string;
  description: string;
  body: string;
};

const mcp = `${siteUrl}/api/mcp`;
const api = `${siteUrl}/api/v1`;

export const docPages: DocPage[] = [
  {
    slug: "getting-started",
    nav: "Getting started",
    title: "Getting started with Acta",
    description: "Make a workspace and a board, add tasks, invite your team and see the same work as a board, a table or a timeline.",
    body: `Acta is a project manager for small teams and the AI agents that work with them. Work lives on **boards**, boards live in **workspaces**, and every task has an id like ACT-12 made from its board's prefix.

## Try it first

The [demo board](${siteUrl}/demo) is the real app, saved in your browser. Drag cards between columns, open one to edit it, and switch to the table or the roadmap timeline. Nothing you do there needs an account.

## Make a workspace

[Sign in](${siteUrl}/login) with a link sent to your email. No password needed. Your first workspace and board come next: name the board and Acta picks its task prefix from the name.

## Add and move tasks

- Press **C** or use the plus at the bottom of a column to add a task.
- Drag a card to another column to change its status: todo, in progress, in review, done, or canceled for dropped work.
- Open a card for its description, subtasks, comments, dates, labels, project, size and priority.
- Every change is kept in the task's activity, with who made it and when.

## Three views of the same tasks

- **Board**: columns by status, or grouped by assignee, priority, size or project.
- **Table**: a spreadsheet of the same tasks, with cells you edit in place and columns you choose.
- **Roadmap**: a timeline of tasks with start and due dates, by month, quarter or year.

Each board remembers your view, columns, sorting and saved filters on every device you sign in on.

## Fields of your own

Every board has status, priority, size, dates, assignee, labels and projects. Add **fields** of your own for anything else: text, numbers, dates and single or multi selects. They show on tasks and as table columns, and you can rename the statuses to what your team calls them.

## Invite your team

Invite people as **owners**, **admins**, **members** or **viewers** from the workspace's settings, and fine-tune what each member may do: edit, delete, comment, manage boards, run the public roadmap or invite. Changes from teammates appear live, and you can see who else is on the board.

## Next

- [Connect AI agents over MCP](${siteUrl}/docs/agents)
- [Use the HTTP API](${siteUrl}/docs/api)
- [Link GitHub](${siteUrl}/docs/github)
- [Publish a public roadmap](${siteUrl}/docs/roadmaps)`,
  },
  {
    slug: "agents",
    nav: "Agents (MCP)",
    title: "Connect AI agents to Acta over MCP",
    description: "Give Claude Code, Codex, Cursor, VS Code and other MCP clients a key to read and work on your Acta boards, with their changes shown live.",
    body: `Acta has an MCP server, so coding agents like Claude Code and Cursor can find their task, move it along, tick off subtasks and leave progress notes while they work. You watch it happen live on the board.

## Make a key

Open **Account → Agents** and make a key. Choose what it may do and which workspaces it reaches:

- **Read**: list boards, tasks, roadmap ideas and activity, and search across every board.
- **Write**: also create, change, sort, comment on, delete and restore tasks, one at a time or many at once.
- **Manage**: also create boards, edit labels, projects, fields and status names, run the public roadmap and triage ideas.

A key acts as the person who made it, never further. Everything an agent does is marked with the key's name, like “Elliot via Claude Code”. You can revoke a key at any time.

## Claude Code

\`\`\`bash
claude mcp add --transport http --scope user acta ${mcp} \\
  --header "Authorization: Bearer <key>"
\`\`\`

## Codex

Add Acta to \`~/.codex/config.toml\`:

\`\`\`toml
[mcp_servers.acta]
url = "${mcp}"
http_headers = { Authorization = "Bearer <key>" }
\`\`\`

## Cursor

Add Acta to \`~/.cursor/mcp.json\`, or \`.cursor/mcp.json\` in a project:

\`\`\`json
{
  "mcpServers": {
    "acta": {
      "url": "${mcp}",
      "headers": { "Authorization": "Bearer <key>" }
    }
  }
}
\`\`\`

## VS Code

Add Acta to \`.vscode/mcp.json\`:

\`\`\`json
{
  "servers": {
    "acta": {
      "type": "http",
      "url": "${mcp}",
      "headers": { "Authorization": "Bearer <key>" }
    }
  }
}
\`\`\`

## Other clients

Any MCP client that speaks streamable HTTP works. The server is at \`${mcp}\` and takes the key as \`Authorization: Bearer <key>\`.

## Tell agents which board to use

Put a line like this in your project's \`AGENTS.md\`, \`CLAUDE.md\` or README:

\`\`\`
Acta board: workspace/board
\`\`\`

The server tells agents how to work: check for an existing task before starting, move it to in progress and assign it to themselves, keep one progress comment up to date, and move it to review when there's something to look at.

## Tools

- **Reading**: \`list_boards\`, \`get_board\`, \`list_tasks\`, \`search_tasks\`, \`get_task\`, \`list_activity\`, \`list_suggestions\`
- **Writing**: \`create_tasks\`, \`update_task\`, \`update_tasks\`, \`sort_column\`, \`add_comment\`, \`edit_comment\`, \`delete_task\`, \`restore_task\`
- **GitHub**: \`link_github\`, \`unlink_github\`, \`open_github_issue\`
- **Managing**: \`create_board\`, \`update_board\`, \`update_roadmap\`, \`review_suggestion\`

Each tool describes its own arguments, and the [HTTP API](${siteUrl}/docs/api) lists them as JSON Schema.

## Bringing work over

Agents moving work from another tracker can keep its history: when each task was created and shipped, and who wrote each comment and when. Work closed as not planned goes to canceled.`,
  },
  {
    slug: "api",
    nav: "HTTP API",
    title: "The Acta HTTP API",
    description: "Read and change Acta boards from scripts, CI jobs, Zapier or n8n with the same keys and tools as the MCP server, as plain JSON.",
    body: `Anything that can send an HTTP request can use Acta: scripts, forms, CI jobs, Zapier or n8n. The API serves the MCP server's tools as plain JSON at \`${api}/<tool>\`, with the same [keys](${siteUrl}/docs/agents) and the same checks. A key can do exactly as much as it can over MCP.

## What a key can do

\`\`\`bash
curl ${api} -H "Authorization: Bearer <key>"
\`\`\`

The answer lists every tool the key may use, with its arguments as JSON Schema and whether it takes GET or POST.

## Reading

Tools that only read take GET, with their arguments in the query string. Lists repeat or use commas:

\`\`\`bash
curl "${api}/list_tasks?board=aaen-studios/acta&status=todo,review" \\
  -H "Authorization: Bearer <key>"
\`\`\`

## Writing

Tools that change things take POST, with their arguments as a JSON body:

\`\`\`bash
curl ${api}/create_tasks \\
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \\
  -d '{"board": "aaen-studios/acta", "tasks": [{"title": "Add CSV export", "labels": ["Feature"]}]}'
\`\`\`

## Answers and errors

- **200**: the tool's result as JSON.
- **400**: a mistake the caller can fix, with an \`error\` saying what to change.
- **401**: the key is missing or was revoked.
- **403**: the key's access doesn't cover the tool.
- **404**: there's no tool by that name.
- **405**: a tool that changes things was called with GET.

CORS is open, since every call needs a key.`,
  },
  {
    slug: "github",
    nav: "GitHub",
    title: "Link GitHub to Acta",
    description: "Branches, commits and pull requests that name a task link to it and move it along, merges mark it done, and issues can sync both ways.",
    body: `Connect a GitHub account or organisation to a workspace, link repositories to boards, and work you do on GitHub shows up on its tasks: pull requests with their checks and review, branches and commits.

## Connect GitHub

An owner or admin opens **Workspace settings → GitHub**, connects the Acta GitHub app, and links each repository to a board. A repository belongs to one board, and a board can have several. The repository pickers suggest boards with the same name.

## Name the task

Put the task's id in a branch name, a pull request title or a commit message, and it links:

- A branch like \`act-12-add-csv-export\`. Each task has a **Copy branch name** button.
- A pull request title like “ACT-12 Add CSV export”.
- A closing keyword in the pull request's description: “Fixes ACT-12”, “Closes ACT-3, ACT-4” or “Resolves ACT-7”.

## What moves tasks

- A branch or commit that names a task moves it to **in progress**.
- An open pull request moves it to **review**. A draft keeps it in progress.
- A merged pull request that names the task in its branch, title or a closing keyword moves it to **done**.

Tasks only ever move forward, and each step can be turned off per repository. Acta can also leave one comment on each pull request listing its tasks, kept up to date as the list changes.

## Link work by hand

For work that didn't name the task, paste the address of a pull request, issue, branch or commit into the task's **Development** section. Agents can do the same with \`link_github\`.

## Sync issues

Turn on **Sync issues** for a repository and its issues come over as tasks, only ones with a chosen label if you set one. After that:

- Title, status and labels stay in step both ways, and the later edit wins.
- Comments made on GitHub come into Acta, and comments made in Acta go to the issue, unless **Send comments to issues** is off.
- An issue closed as not planned moves its task to canceled.
- **Open issue** in a task's Development section, or \`open_github_issue\` for agents, turns a task into an issue.

## Who made the change

Changes from GitHub are marked “via GitHub” and made as the member who linked that GitHub account under **Account**, or else as whoever connected GitHub.`,
  },
  {
    slug: "roadmaps",
    nav: "Public roadmaps",
    title: "Publish a public roadmap",
    description: "Turn any Acta board into a public roadmap page where visitors vote and send ideas, with a changelog of shipped work and an RSS feed.",
    body: `Any board can be published as a public roadmap: a page that shows what you're planning, what's under way and what's shipped. It's off until you turn it on, and only the tasks you mark public show.

## Publish it

Open the board's **Public** view and switch it from Private to Public. **Manage** chooses which tasks show, and new tasks can go on it by themselves if you want. **Customize** sets how the page looks, and **Preview** shows it as visitors will. The page lives at \`/p/<workspace>/<board>\`. See [Acta's own](${siteUrl}/p/aaen-studios/acta) for an example.

## Votes and ideas

Visitors can vote on what you're planning and send ideas of their own. You review ideas in the board's Public view, turn the good ones into tasks, and decline the rest.

## Make it yours

Choose the page's title, introduction, theme, colour, header style, links, a call to action, an announcement bar, and the order of its sections. Show or hide dates, progress, who's on it, notes and projects. Advanced pages can add their own CSS and header and footer HTML.

## Shipped work and feeds

Finished tasks move to the shipped list with their dates, so the page doubles as a changelog. While the page shows its shipped work, it also has an RSS feed at \`/p/<workspace>/<board>/rss.xml\`.

## Search engines

Published roadmaps are listed in Acta's sitemap and show your product's name in search results. If a roadmap should only be seen by people with the link, turn on **Hide from search engines** under **Customize → Page**.`,
  },
];

export const docUrl = (slug: string) => `${siteUrl}/docs/${slug}`;

/** A page's sections, for the page and its table of contents */
export function sections(body: string) {
  const [intro, ...rest] = body.split(/^## /m);
  return {
    intro: intro.trim(),
    sections: rest.map((part) => {
      const [heading, ...lines] = part.split("\n");
      const title = heading.trim();
      return { id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), title, body: lines.join("\n").trim() };
    }),
  };
}
