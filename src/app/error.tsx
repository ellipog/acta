"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { Dither } from "@/components/ui/dither";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-page px-5 py-6 sm:px-10">
      <title>Something went wrong · Acta</title>
      <Wordmark />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center py-16 text-center">
        <div className="relative h-36 w-44">
          <Dither name="terrain-mars-crater" tone="muted" fill smooth />
        </div>
        <p className="mt-8 font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">Error · Something broke</p>
        <h1 className="mt-2 font-display text-4xl">This didn’t load</h1>
        <p className="mt-2 text-sm text-ink-2">
          Something went wrong on our side. Try again, or head back to your boards.
        </p>
        {digest ? <p className="mt-3 font-mono text-[11px] text-ink-3">Ref {digest}</p> : null}
        <div className="mt-8 flex items-center gap-5 text-sm">
          <button onClick={() => retry()} className="text-lapis underline underline-offset-2">
            Try again
          </button>
          <Link href="/home" className="text-ink-2 hover:text-ink">
            Your boards
          </Link>
        </div>
      </main>
    </div>
  );
}
