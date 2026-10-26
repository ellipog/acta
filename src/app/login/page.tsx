import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { Dither } from "@/components/ui/dither";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Acta",
  description: "Sign in to Acta, or make an account. No password needed.",
};

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
      <aside className="relative hidden overflow-hidden border-r border-ink bg-sunken lg:block">
        <Dither name="cave-stalactites" tone="ink" fill className="opacity-80" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-sunken via-sunken/80 to-transparent px-10 pt-24 pb-10">
          <p className="font-display text-4xl leading-tight">Things done, laid down in layers.</p>
          <p className="mt-3 max-w-sm text-sm text-ink-2">
            Boards, tables and a public roadmap. Free for the work, always.
          </p>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Wordmark />
          <Link href="/" className="text-sm text-ink-3 hover:text-ink">
            Back to the site
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <Suspense fallback={<div className="h-72" />}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="text-center text-xs text-ink-3">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
            terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
            privacy policy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
