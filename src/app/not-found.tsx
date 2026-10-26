import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/site-chrome";
import { Dither } from "@/components/ui/dither";

export const metadata: Metadata = {
  title: "Not found · Acta",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-page px-5 py-6 sm:px-10">
      <Wordmark />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center py-16 text-center">
        <div className="relative h-36 w-44">
          <Dither name="cave-stalactites" tone="muted" fill smooth />
        </div>
        <p className="mt-8 font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">404 · Nothing here</p>
        <h1 className="mt-2 font-display text-4xl">This page isn’t here</h1>
        <p className="mt-2 text-sm text-ink-2">
          The address may be mistyped, or the board was renamed, made private or deleted.
        </p>
        <div className="mt-8 flex items-center gap-5 text-sm">
          <Link href="/home" className="text-lapis underline underline-offset-2">
            Your boards
          </Link>
          <Link href="/" className="text-ink-2 hover:text-ink">
            Acta home
          </Link>
        </div>
      </main>
    </div>
  );
}
