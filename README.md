<p align="center">
  <img src="public/logos/banner/acta-banner-panorama.png" alt="Acta" width="100%" />
</p>

<p align="center">
  <strong>Latin for “things done.”</strong><br />
  A calm project manager for small teams and the agents that work with them.
</p>

<p align="center">
  <a href="https://acta.aaenz.no">acta.aaenz.no</a> ·
  <a href="https://acta.aaenz.no/demo">Try the demo</a> ·
  <a href="#agents">Agents and MCP</a> ·
  <a href="#running-it">Run it yourself</a>
</p>

---

## What it does

|  |  |
| --- | --- |
| **Board, table and timeline** | One set of tasks, three ways to see it. Drag cards between columns, edit cells in place, and plan on a timeline. |
| **Live** | Changes from teammates and agents appear as they happen, and you can see who else is on the board. |
| **Fast** | Boards you've opened stay in memory. Going back to one shows it at once and fetches only what changed. |
| **Workspaces** | Invite people as owners, admins, members or viewers, and fine-tune what each member may do. Each workspace has its own picture and holds as many boards as you like. |
| **My tasks** | Everything assigned to you, from every board in the workspace, in one place. |
| **Public roadmaps** | Publish any board as a roadmap page. Visitors can vote and send ideas, and you choose which tasks show and how the page looks: its theme, colour, header, links, announcement and the order of its sections. |
| **Appearance** | Light, dark or your system's mode, an accent of your own, warmer or cooler surfaces, more contrast, larger text and less motion. |
| **Agents** | An MCP server lets Claude Code, Cursor and other agents read and work on your boards with keys you control. |

Built with Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4 and Supabase (auth, Postgres,
realtime and storage).

## Agents

Acta has an MCP server at `/api/mcp`. Make a key under **Account → Agents** and add the server to your agent:

```bash
claude mcp add --transport http --scope user acta https://acta.aaenz.no/api/mcp \
  --header "Authorization: Bearer <key>"
```

Then put a line like this in your project's `AGENTS.md`, `CLAUDE.md` or README, so agents know which board to use:

```
Acta board: workspace/board
```

| Key | What it can do |
| --- | --- |
| **Read** | List boards, tasks, suggestions and activity, and search across every board it can reach |
| **Write** | Also create, change, sort, comment on, delete and restore tasks, one at a time or many at once |
| **Manage** | Also create boards, add, rename and recolour labels and projects, run the public roadmap and triage ideas |

A key acts as the person who made it, and only in the workspaces they chose. The route checks the key, then
`agent_apply` and `agent_board` check it again in the database before running the app's own write path, so a key
never gets further than its owner. Everything an agent does is marked with the key's name, shown as
“Elliot via Claude Code”, and a key can only edit the comments it wrote.

Agents bringing work over from another tracker can keep its history: when each task was created and shipped,
and who wrote each comment and when. Work closed as not planned goes to **Canceled**.

## Running it

```bash
bun install
cp .env.example .env.local
bun run dev
```

The app runs at http://localhost:3000. Without Supabase keys the marketing site, `/demo` and `/library` still
work, and the demo board saves to the browser.

### Environment

| Variable | What it does |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project’s publishable (anon) key |
| `SUPABASE_SECRET_KEY` | Secret key, server only. Used for avatar uploads, account deletion and agent keys |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | Comma-separated sign-in methods: `email`, `google`, `github` |
| `NEXT_PUBLIC_PUBLIC_ORIGIN` | Optional. The origin public roadmaps are served from, e.g. `https://acta.page` |

### Supabase

1. Apply everything in `supabase/migrations` in order (`supabase db push`, or paste each file into the SQL
   editor). They create the tables, row-level security, RPCs, the `avatars` storage bucket and the realtime
   publication.
2. Under **Authentication → URL configuration**, set the site URL to your origin and add `<your origin>/**` and
   `http://localhost:*/**` as redirect URLs.
3. Enable the OAuth providers you list in `NEXT_PUBLIC_AUTH_PROVIDERS`.
4. Under **Authentication → Emails**, set up custom SMTP. The built-in sender only mails your own team and allows
   a couple of emails an hour, so sign-in links won’t reach anyone else.
5. Admins, who can see `/admin` analytics, come from `public.admin_emails`. Insert your address there.

### Public roadmaps

Each board can publish a roadmap page at `/p/<workspace>/<board>`. Point a second domain at the app and set
`NEXT_PUBLIC_PUBLIC_ORIGIN` to it, and `src/proxy.ts` serves `<that domain>/<workspace>/<board>` from there.
A board's **new tasks are public** setting puts new tasks on its roadmap, for people and agents alike.

## Deploying

Acta runs on Vercel at `acta.aaenz.no` (`siteHost` in `src/lib/slugs.ts`). `vercel.json` keeps its functions in
Frankfurt, next to the Supabase project.

1. Import the repo in Vercel and add the environment variables above.
2. Add the domain to the Vercel project and create the DNS record it asks for. On Cloudflare, leave it unproxied.
3. Set up the Supabase URLs and SMTP as described above.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the dev server |
| `bun run build` | Production build |
| `bun run lint` | ESLint |
| `bun run test` | Tests in `tests/`: every kind of board edit saved and read back, member permissions, table drag and drop, public page settings and appearance |
| `bun run dither` | Re-render the one-bit images in `public/dither` from `assets/source` |
| `bun run logo` | Re-draw the favicon and app icons from `src/lib/logo.ts` |

## Layout

```
src/app            routes: landing, /demo, /login, /new, /[workspace]/[board], /p (public roadmaps), /library (unlisted UI kit)
src/components     board app (board, table, timeline, roadmap views), landing sections, UI kit
src/lib            board state and reducer, loading, caching and live sync with Supabase, server actions, slugs
src/lib/agents     agent keys and the MCP server behind /api/mcp
supabase           SQL migrations
assets             source images and dither recipes
```

Acta board: aaen-studios/acta
