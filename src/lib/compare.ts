// How Acta compares with the tools people come from. Kept to what each tool does by itself, without add-ons, and
// dated, since they all change. Where the other tool is the better pick, the page says so

export const checked = "October 2026";

export type Comparison = {
  slug: string;
  name: string;
  title: string;
  description: string;
  intro: string;
  // What, how Acta does it, how the other tool does it
  rows: [string, string, string][];
  pickThem: string[];
  pickActa: string[];
};

export const comparisons: Comparison[] = [
  {
    slug: "linear",
    name: "Linear",
    title: "Acta vs Linear",
    description:
      "Acta and Linear both track software work. Linear is built for larger product teams; Acta is smaller, publishes a public roadmap with votes, and lets agents work on boards over MCP.",
    intro:
      "Linear is a fast, opinionated issue tracker for software teams, with cycles, triage and initiatives. Acta is a smaller project manager for teams who also want a public roadmap and AI agents working on the same boards.",
    rows: [
      ["Views", "Board, table, timeline and a public page", "List, board, timeline and more"],
      ["Public roadmap with votes and ideas", "Built in, on any board", "No public voting page of its own; customer requests stay inside the workspace"],
      ["AI agents", "MCP server and HTTP API, with keys per agent and every change marked", "MCP server and GraphQL API"],
      ["GitHub", "Pull requests, branches and commits move tasks; issues sync both ways", "Pull requests and branches move issues; GitHub issues sync"],
      ["Sprints", "Not yet", "Cycles"],
    ],
    pickThem: [
      "You run sprints or cycles and want triage, SLAs and initiatives across many teams.",
      "You need the integrations a larger tool has, like Slack, Zendesk and Intercom.",
    ],
    pickActa: [
      "You want a public roadmap your users can vote on, without another tool.",
      "Agents do real work on your boards and you want to see who did what, live.",
      "You want a calmer tool for a small team, with fields of your own.",
    ],
  },
  {
    slug: "trello",
    name: "Trello",
    title: "Acta vs Trello",
    description:
      "Trello is the classic kanban board. Acta keeps the board and adds a table, a timeline, task ids, GitHub links and a public roadmap, with AI agents over MCP.",
    intro:
      "Trello made the kanban board familiar, and it's still a good one, with Power-Ups for nearly anything. Acta starts from the same board and adds what software teams reach for next.",
    rows: [
      ["Views", "Board, table, timeline and a public page on every plan", "Board; table, timeline and others on paid plans"],
      ["Task ids", "Every task has one, like ACT-12", "Cards have no short ids"],
      ["Subtasks", "Checklists on every task", "Checklists on every card"],
      ["GitHub", "Branches, commits and pull requests move tasks, and issues sync", "A Power-Up that attaches them to cards"],
      ["Public roadmap with votes", "Built in", "A public board, with votes through a Power-Up"],
      ["AI agents", "MCP server and HTTP API", "REST API"],
    ],
    pickThem: [
      "You plan more than software, like events or content, and want Power-Ups for it.",
      "Your team already lives in Atlassian's tools.",
    ],
    pickActa: [
      "You ship software and want tasks to follow your branches and pull requests.",
      "You want a table and a timeline without a paid plan.",
      "You want agents to pick up tasks and report back on the board.",
    ],
  },
  {
    slug: "jira",
    name: "Jira",
    title: "Acta vs Jira",
    description:
      "Jira can model any process at any size. Acta is for small teams who want a calm board, a public roadmap and AI agents, set up in a minute.",
    intro:
      "Jira is the standard for large software organisations: workflows, schemes, permissions and reports for any process. Acta is for small teams who'd rather not configure all that.",
    rows: [
      ["Setup", "A board in a minute, with sensible statuses you can rename", "Projects, workflows and schemes to configure"],
      ["Views", "Board, table, timeline and a public page", "Board, list, timeline, backlog and many reports"],
      ["Public roadmap with votes", "Built in", "Through Jira Product Discovery or the Marketplace"],
      ["AI agents", "MCP server and HTTP API, with keys per agent", "Atlassian's MCP server and REST API"],
      ["GitHub", "Branches, commits and pull requests move tasks, and issues sync", "GitHub for Jira app"],
      ["Sprints and reports", "Not yet", "Sprints, burndown, velocity and more"],
    ],
    pickThem: [
      "You need sprints, detailed workflows, approvals or compliance reporting.",
      "Many teams share one tracker and need it administered centrally.",
    ],
    pickActa: [
      "You're a small team and want to spend time on the work, not the tracker.",
      "You want a public roadmap and changelog with no extra product.",
      "You want agents working on tasks with every change marked and visible.",
    ],
  },
  {
    slug: "github-projects",
    name: "GitHub Projects",
    title: "Acta vs GitHub Projects",
    description:
      "GitHub Projects plans work right where the code is. Acta links to the same repositories and adds a public roadmap with votes, fields for non-developers, and AI agents over MCP.",
    intro:
      "GitHub Projects lays issues and pull requests out as tables, boards and roadmaps, free, next to the code. Acta links to the same repositories and is built for teams where not everyone lives on GitHub.",
    rows: [
      ["Where tasks live", "In Acta, linked to GitHub work, with issues synced if you want", "GitHub issues and pull requests"],
      ["Views", "Board, table, timeline and a public page", "Table, board and roadmap"],
      ["Public roadmap with votes and ideas", "Built in", "A public project, with votes through issue reactions"],
      ["People without GitHub accounts", "Sign in with an email link", "Need a GitHub account"],
      ["AI agents", "MCP server and HTTP API", "GitHub's MCP server and API"],
      ["Price", "Free to start", "Included with GitHub"],
    ],
    pickThem: [
      "Everyone on the team works on GitHub and every task is an issue anyway.",
      "You want planning with no other tool at all.",
    ],
    pickActa: [
      "Designers, support or clients plan with you and don't use GitHub.",
      "You want a public roadmap visitors vote on and send ideas to.",
      "You want branches and pull requests to move tasks, without every task being an issue.",
    ],
  },
];

export const compareSlugs = comparisons.map((c) => c.slug);
