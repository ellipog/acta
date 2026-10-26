# Acta

Latin for “things done.” A calm project manager for small teams: boards, tables, a timeline, custom fields,
workspaces with roles, live collaboration and an opt-in public roadmap with votes and suggestions.

Built with Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4 and Supabase (auth, Postgres,
realtime and storage).

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev
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
2. Under Authentication → URL configuration, add `<your origin>/auth/callback` as a redirect URL.
3. Enable the OAuth providers you list in `NEXT_PUBLIC_AUTH_PROVIDERS`.
4. Admins (who can see `/admin` analytics) come from `public.admin_emails`. Insert your address there.

### Public roadmaps

Each board can publish a roadmap page. It lives at `/p/<workspace>/<board>`. If you point a second domain at
the app (`acta.page` in `src/lib/slugs.ts`), requests to `acta.page/<workspace>/<board>` are rewritten there
by `src/proxy.ts`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run dither` | Re-render the one-bit images in `public/dither` from `assets/source` |
| `npm run logo` | Re-draw the favicon and app icons from `src/lib/logo.ts` |

## Layout

```
src/app            routes: landing, /demo, /login, /new, /[workspace]/[board], /p (public roadmaps), /library (unlisted UI kit)
src/components     board app (board, table, timeline, roadmap views), landing sections, UI kit
src/lib            board state and reducer, sync with Supabase, server actions, slugs
supabase           SQL migrations
assets             source images and dither recipes
```
