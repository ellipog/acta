# Acta

Latin for “things done.” A calm project manager: boards, tables, a timeline, custom fields,
workspaces with roles, live collaboration and an opt-in public roadmap with votes and suggestions.

Built with Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4 and Supabase (auth, Postgres,
realtime and storage).

## Running it

```bash
bun install
cp .env.example .env.local
bun run dev
```

The app runs at http://localhost:3000. Without Supabase keys the marketing site, `/demo` and `/library` still
work; the demo board saves to the browser.

### Environment

| Variable | What it does |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project’s publishable (anon) key |
| `SUPABASE_SECRET_KEY` | Secret key, server only. Used for avatar uploads and account deletion |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | Comma-separated sign-in methods: `email`, `google`, `github` |
| `NEXT_PUBLIC_PUBLIC_ORIGIN` | Optional. The origin public roadmaps are served from, e.g. `https://acta.page` |

### Supabase

1. Apply everything in `supabase/migrations` in order (`supabase db push`, or paste each file into the SQL
   editor). They create the tables, row-level security, RPCs, the `avatars` storage bucket and the realtime
   publication.
2. Under Authentication → URL configuration, set the site URL to your origin and add `<your origin>/**` and
   `http://localhost:*/**` as redirect URLs.
3. Enable the OAuth providers you list in `NEXT_PUBLIC_AUTH_PROVIDERS`.
4. Under Authentication → Emails, set up custom SMTP. The built-in sender only mails your own team and allows a
   couple of emails an hour, so sign-in links won’t reach anyone else.
5. Admins (who can see `/admin` analytics) come from `public.admin_emails`. Insert your address there.

### Public roadmaps

Each board can publish a roadmap page. It lives at `/p/<workspace>/<board>`. If you point a second domain at
the app and set `NEXT_PUBLIC_PUBLIC_ORIGIN` to it, requests to `<that domain>/<workspace>/<board>` are rewritten
there by `src/proxy.ts`.

## Agents

Acta has an MCP server at `/api/mcp`, so AI agents can read and work on boards. People make keys under
Account → Agents: read only, read and write, or manage, for all their workspaces or only some. A key acts as the
person who made it. The route checks the key, and `agent_apply` and `agent_board` in the database check it again
before running the app's own write path, so a key never gets further than its owner. Comments and activity that
came through a key carry its name in `via`, shown as “Elliot via Claude Code”.

A line like `Acta board: workspace/board` in a project's AGENTS.md or CLAUDE.md tells agents which board to use.

## Deploying

Acta runs on Vercel at `acta.aaenz.no` (`siteHost` in `src/lib/slugs.ts`). `vercel.json` keeps its functions in
Frankfurt, next to the Supabase project.

1. Import the repo in Vercel and add the environment variables above.
2. Add the domain to the Vercel project and create the DNS record it asks for. On Cloudflare, leave it unproxied.
3. Set the Supabase URLs and SMTP as described above.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the dev server |
| `bun run build` | Production build |
| `bun run lint` | ESLint |
| `bun run dither` | Re-render the one-bit images in `public/dither` from `assets/source` |
| `bun run logo` | Re-draw the favicon and app icons from `src/lib/logo.ts` |

## Layout

```
src/app            routes: landing, /demo, /login, /new, /[workspace]/[board], /p (public roadmaps), /library (unlisted UI kit)
src/components     board app (board, table, timeline, roadmap views), landing sections, UI kit
src/lib            board state and reducer, sync with Supabase, server actions, slugs
src/lib/agents     agent keys and the MCP server behind /api/mcp
supabase           SQL migrations
assets             source images and dither recipes
```
