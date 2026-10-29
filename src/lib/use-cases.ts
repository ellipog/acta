import { siteUrl } from "./slugs";

// Pages for what people come to Acta to do, written in Markdown like the docs. "## " starts a section

export type UseCase = { slug: string; nav: string; title: string; description: string; intro: string; body: string };

export const useCases: UseCase[] = [
  {
    slug: "public-roadmap",
    nav: "A public roadmap",
    title: "A public roadmap your users can vote on",
    description:
      "Publish any Acta board as a public roadmap: visitors vote and send ideas, shipped work becomes a changelog with an RSS feed, and it stays in step with the board your team works on.",
    intro:
      "Most public roadmaps are a second copy of the work, kept up by hand until someone forgets. In Acta the public page is a view of the board your team already uses, so it's never out of date.",
    body: `## One switch to publish

Open a board's Public view and switch it on. You choose which tasks show, or let new tasks go on it by themselves. The page is at an address like [acta.aaenz.no/p/aaen-studios/acta](${siteUrl}/p/aaen-studios/acta), Acta's own.

## Votes and ideas

Visitors vote on what's planned and send ideas, with a name if they like. You review ideas in the Public view, turn the good ones into tasks and decline the rest. Votes show beside each task, so you can see what people want.

## A changelog for free

When a task is done it moves to the shipped list with its date. That list is your changelog, with an RSS feed for people who want to follow along.

## Your look, your name

Pick a theme, a colour, a header style, links, a call to action and an announcement. The page carries your name in search results and link previews, not ours. Advanced pages can add their own CSS.

## Keep it unlisted if you like

Turn on **Hide from search engines** and only people with the link will find it.`,
  },
  {
    slug: "ai-agents",
    nav: "Work with AI agents",
    title: "A project board your AI agents work on too",
    description:
      "Connect Claude Code, Codex, Cursor and other agents to Acta over MCP. They find their task, move it along, tick off subtasks and leave notes, and you watch it happen live.",
    intro:
      "Coding agents do real work now, but their progress usually lives in a terminal nobody else sees. Acta gives them the same board as the rest of the team.",
    body: `## Agents keep the board up to date

With an Acta key, an agent checks for a task before it starts, moves it to in progress, ticks off subtasks and keeps a progress comment current. When there's a pull request to look at, it moves the task to review with the link.

## Keys you control

Each key acts as the person who made it and never goes further. Choose whether it can read, write or manage, and which workspaces it reaches. Everything it does is marked with its name, like “Elliot via Claude Code”, and you can revoke it at any time.

## Works with the agents you use

Claude Code, Codex, Cursor, VS Code and any client that speaks MCP over HTTP. Scripts and tools like n8n or Zapier can use the same keys through the HTTP API. [Set it up in a minute](${siteUrl}/docs/agents).

## GitHub closes the loop

When an agent names the task in its branch or pull request, Acta links them and marks the task done on merge, even if the agent forgets.`,
  },
  {
    slug: "small-teams",
    nav: "Small teams",
    title: "Project management for small teams",
    description:
      "Acta is a calm project manager for teams of a few people: a board, a table and a timeline of the same tasks, live updates, GitHub links and a public roadmap, without the setup of a big tool.",
    intro:
      "Big trackers are built for big organisations, and small teams end up paying for it in setup and noise. Acta does the things a small team needs, and does them quietly.",
    body: `## Ready in a minute

Sign in with a link sent to your email, name a board and start adding tasks. Statuses, priorities, sizes, labels and projects are there from the start, and you can rename statuses and add fields of your own.

## The same tasks, three ways

A board for the day's work, a table for sorting and bulk edits, and a timeline for planning months ahead. Each person's view, columns and filters are saved and follow them to every device.

## Live, together

Changes from teammates show up as they happen, and you can see who else is on the board. Everything is kept in each task's activity.

## Roles that fit

Invite people as owners, admins, members or viewers, and fine-tune what each member may do. Clients and stakeholders can follow along on the public roadmap without an account.

## Try it now

The [demo board](${siteUrl}/demo) is the real app, saved in your browser, no account needed.`,
  },
];

export const useCaseSlugs = useCases.map((u) => u.slug);
