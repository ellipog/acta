import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountButton, HeaderCta } from "@/components/account-button";
import { LogoMark } from "@/components/ui/logo-mark";
import { actaRoadmapHref } from "@/lib/slugs";
import { Wordmark } from "@/components/wordmark";

export { LogoMark, Wordmark };

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Wordmark />
        <nav className="hidden items-center gap-5 text-sm text-ink-2 md:flex">
          <Link href="/#board" className="hover:text-ink">Product</Link>
          <Link href="/demo" className="hover:text-ink">Demo</Link>
          <Link href={actaRoadmapHref} className="hover:text-ink">Roadmap</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <AccountButton />
          <HeaderCta />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="strata h-4" />
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 py-12 sm:px-6">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-ink-2">
            Acta, Latin for “things done.” A project manager, built in layers.
          </p>
        </div>
        <nav aria-label="Legal" className="flex gap-4 text-xs text-ink-3">
          <Link href={actaRoadmapHref} className="hover:text-ink">
            Roadmap
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
