import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { Wordmark } from "@/components/wordmark";
import { Skeleton } from "@/components/ui/display";
import { Dither } from "@/components/ui/dither";
import { getCurrentUser } from "@/lib/auth";
import { checkAuthorize, connectionCap, connections } from "@/lib/oauth/grants";
import { backTo, redirectPlace } from "@/lib/oauth/redirects";
import { headersOrigin } from "@/lib/origin";
import { siteUrl } from "@/lib/slugs";
import { getWorkspaces } from "@/lib/workspace";
import { Consent } from "./consent";
import { Go } from "./go";
import { authorizeQuery } from "./query";

export const metadata: Metadata = {
  title: "Connect an agent",
  robots: { index: false, follow: false },
};

// The authorization endpoint. An MCP client sends the person here to sign in and choose what it may do in Acta
export default function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
      <Wordmark />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
        <Suspense fallback={<Skeleton className="h-[30rem]" />}>
          <Authorize searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

function Stopped({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <Dither name="crystal-shard" tone="muted" />
      <h1 className="mt-6 font-display text-3xl">This app can’t connect</h1>
      <p className="mt-2 text-sm text-ink-2">{message}</p>
      <Link href="/home" className="mt-6 text-sm text-lapis underline underline-offset-2">
        Go to Acta
      </Link>
    </div>
  );
}

async function Authorize({ searchParams }: { searchParams: PageProps<"/oauth/authorize">["searchParams"] }) {
  const query = authorizeQuery(await searchParams);
  if (!query) return <Stopped message="The sign-in link repeats a parameter. Start connecting again from the app." />;
  const origin = headersOrigin(await headers(), siteUrl);
  const check = await checkAuthorize(query, origin);
  if ("show" in check) return <Stopped message={check.show} />;
  if ("send" in check) return <Go to={check.send} label="Back to the app" />;

  // Visitors without a session never get here: the proxy sends them to sign in first. This is for a session that
  // has run out
  const user = await getCurrentUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(query as Record<string, string>)}`;
    return <Go to={`/login?next=${encodeURIComponent(here)}`} label="Sign in" />;
  }
  const [workspaces, count] = await Promise.all([getWorkspaces(), connections(user.id)]);
  const { client, redirectUri, state } = check;

  return (
    <Consent
      query={query}
      client={{
        name: client.name,
        from: client.document ? new URL(client.id).host : null,
        returnsTo: redirectPlace(redirectUri),
      }}
      email={user.email}
      access={check.access}
      workspaces={workspaces.map((w) => ({ id: w.id, slug: w.slug, name: w.name }))}
      full={count >= connectionCap ? `You have ${connectionCap} agents signed in. Disconnect one under Account → Agents first.` : null}
      denyUrl={backTo(redirectUri, {
        error: "access_denied",
        error_description: "The person didn’t allow it.",
        state,
        iss: origin,
      })}
    />
  );
}
