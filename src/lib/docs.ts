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
const roadmapApi = `${siteUrl}/api/roadmap/v1`;

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

CORS is open, since every call needs a key.

## Public roadmaps

To build a public roadmap into your own site, with its votes and ideas, use the [roadmap API](${siteUrl}/docs/roadmap-api). Its keys reach only what the public page shows, so they can sit in a web page's code. The keys here act as you and can change anything you can, so keep them on a server.`,
  },
  {
    slug: "roadmap-api",
    nav: "Roadmap API",
    title: "The public roadmap API",
    description: "Build a board's public roadmap into your own site: list its tasks and ideas, and let visitors vote and send ideas, with a publishable key.",
    body: `The roadmap API puts a board's [public roadmap](${siteUrl}/docs/roadmaps) into your own site, app or widget. It lists the roadmap's tasks and ideas, and lets your visitors vote and send ideas, at \`${roadmapApi}\`.

It holds only what the public page shows: tasks marked public, and only the details the page's **Customize** settings show. It's apart from the [HTTP API](${siteUrl}/docs/api), whose keys act as a person and can change anything they can.

## Keys

Open the board's **Public** view, then **Customize → API**, and make a key. Anyone who can change the public roadmap can make keys for it, and a board can have up to 10.

A roadmap key is publishable: it starts with \`acta_pk_\` and can sit in a web page's code where anyone can read it, as it reaches only what the page shows anyway. **Rotate** swaps it for a new one when it's been passed around too far, and **Revoke** stops it working at once.

Send it as a bearer token, an \`X-Acta-Key\` header, or \`?key=\`:

\`\`\`bash
curl ${roadmapApi}/tasks -H "Authorization: Bearer acta_pk_..."
\`\`\`

The roadmap has to be public. While it's private, calls answer 404.

## Sites

By default any site can call a key from a browser. List your own sites on the key, like \`https://yourco.com\`, and browsers on other sites are turned away. Calls from servers, which send no Origin, still work.

## Reading

| Call | What it gives |
| --- | --- |
| \`GET /\` | The board, its page's title, stages, links and settings, and how many tasks are in each stage |
| \`GET /tasks\` | The roadmap's tasks |
| \`GET /tasks/ACT-12\` | One task, by its id or number |
| \`GET /ideas\` | The ideas visitors sent, where the page shows them |

\`GET /tasks\` takes these, all optional:

- \`stage\`: \`planned\`, \`progress\` or \`shipped\`, or several with commas.
- \`project\` and \`label\`: only tasks with that project or label.
- \`q\`: words in the title or description.
- \`sort\`: \`position\`, the page's own order, or \`votes\`, \`newest\`, \`shipped\` or \`due\`.
- \`limit\`, up to 200 and 100 by default, and \`offset\`, to page through them. The answer's \`total\` counts every match.

\`GET /ideas\` takes \`sort\`: \`top\` or \`new\`.

Each task has its id, title, description in Markdown, status, stage and the stage's name on the page. Its project, labels, dates, subtask progress, votes and who's on it come where the page shows them. With **Time to ship** on, shipped tasks also have \`opened\`, \`closed\` and \`time_to_close\`, both in seconds and as words like “3 days”.

## Votes and ideas

Votes and ideas work as they do on the page, and only where it takes them. Each needs a \`visitor\`: your site's own id for the person, 8 to 64 letters, numbers and hyphens, kept the same for them each time so they count once. A signed-in user's id works well, and a random one kept in their browser works too. Acta keeps it only as a hash, and apart from the visitors of the page itself.

\`\`\`bash
curl ${roadmapApi}/tasks/ACT-12/vote \\
  -H "Authorization: Bearer acta_pk_..." -H "Content-Type: application/json" \\
  -d '{"visitor": "user-48213", "on": true}'
\`\`\`

| Call | Body |
| --- | --- |
| \`POST /tasks/ACT-12/vote\` | \`visitor\`, and \`on\`: \`false\` takes the vote back |
| \`POST /ideas\` | \`visitor\`, a \`title\` of up to 200 characters, and \`details\` of up to 2,000 |
| \`POST /ideas/<id>/vote\` | \`visitor\` and \`on\` |

Votes answer with the new count. Each visitor can send 10 ideas a day, and each board takes 300. Send \`visitor\` with a read too, and each task and idea says whether they've voted for it.

## Limits

Each key takes 240 reads and 30 votes or ideas a minute from each address. Past that, calls answer 429 with a \`Retry-After\` header in seconds. Reads without a visitor can be kept for 30 seconds.

## Answers and errors

- **200**: the answer as JSON. **201**: a new idea.
- **400**: a mistake the caller can fix, with an \`error\` saying what to change.
- **401**: the key is missing, or was rotated or revoked.
- **403**: a site the key doesn't list, or a roadmap that doesn't take ideas.
- **404**: no such task or idea, a roadmap that isn't public, or one that doesn't take votes.
- **429**: too many calls. Wait for \`Retry-After\`.

## Without a key

Every public roadmap also has a read-only feed at \`/api/public/<workspace>/<board>\`, open to anyone, with all of the page's tasks and ideas in one answer.`,
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

Choose the page's title, introduction, theme, colour, header style, links, a call to action, an announcement bar, and the order of its sections. Show or hide dates, progress, who's on it, notes, projects and labels. Advanced pages can add their own CSS and header and footer HTML.

## Shipped work and feeds

Finished tasks move to the shipped list with their dates, so the page doubles as a changelog. Turn on **Time to ship** and each one also says how long it took, from when the task was made to when it was done. While the page shows its shipped work, it also has an RSS feed at \`/p/<workspace>/<board>/rss.xml\`.

## Build it into your site

The [roadmap API](${siteUrl}/docs/roadmap-api) lists the roadmap's tasks and ideas for your own site or app, and lets your visitors vote and send ideas from there.

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
