import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/site-chrome";
import { Avatar, Skeleton } from "@/components/ui/display";
import { Dither } from "@/components/ui/dither";
import type { DitherName } from "@/lib/dither-assets";
import type { WorkspaceSummary } from "@/lib/live";
import { createClient } from "@/lib/supabase/server";
import { JoinButton } from "./join-button";

export const metadata: Metadata = {
  title: "Join a workspace · Acta",
  robots: { index: false, follow: false },
};

type Preview = {
  name: string;
  slug: string;
  sigil: DitherName;
  tone: WorkspaceSummary["tone"];
  members: number;
  joined: boolean;
};

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-6 sm:px-10">
      <Wordmark />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
        <Suspense fallback={<Skeleton className="h-72" />}>
          <Invite params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Invite({ params }: { params: PageProps<"/join/[token]">["params"] }) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: user }, { data }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("invite_preview", { p_token: token }),
  ]);
  const preview = data as Preview | null;

  if (!preview)
    return (
      <div className="flex flex-col items-center text-center">
        <Dither name="crystal-shard" tone="muted" />
        <h1 className="mt-6 font-display text-3xl">This link doesn’t work</h1>
        <p className="mt-2 text-sm text-ink-2">
          Invite links stop working when someone resets them. Ask whoever sent it for a new one.
        </p>
        <Link href="/" className="mt-6 text-sm text-lapis underline underline-offset-2">
          Go to Acta
        </Link>
      </div>
    );

  if (preview.joined) redirect(`/${preview.slug}`);
  const signedIn = Boolean(user.user);

  return (
    <div className="flex flex-col items-center text-center">
      <span className="relative">
        <Avatar name={preview.name} sigil={preview.sigil} tone={preview.tone} size="xl" className="size-20" />
      </span>
      <p className="mt-6 font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">You’re invited</p>
      <h1 className="mt-2 font-display text-4xl">{preview.name}</h1>
      <p className="mt-2 text-sm text-ink-2">
        {preview.members} {preview.members === 1 ? "person works" : "people work"} here. Join to see their boards and
        work on them together.
      </p>
      <div className="mt-8 w-full">
        {signedIn ? (
          <JoinButton token={token} />
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
            className="flex h-11 w-full items-center justify-center gap-2 border border-lapis bg-lapis text-sm font-medium text-on-accent hover:bg-lapis/90"
          >
            Sign in to join
          </Link>
        )}
      </div>
    </div>
  );
}
