import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderSearch } from "@/components/command-palette";
import { ditherAssets } from "@/lib/dither-assets";
import { cn } from "@/lib/utils";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <span aria-hidden className="flex h-4 w-4 flex-col justify-between">
        <span className="h-[3px] bg-lapis" />
        <span className="h-[3px] w-3 bg-pyrite" />
        <span className="h-[3px] bg-current" />
      </span>
      <span className="font-display text-xl tracking-[0.18em]">ACTA</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Wordmark />
        <nav className="hidden items-center gap-5 text-sm text-ink-2 md:flex">
          <Link href="/#board" className="hover:text-ink">Product</Link>
          <Link href="/#roadmap" className="hover:text-ink">Roadmap</Link>
          <Link href="/demo" className="hover:text-ink">Demo</Link>
          <Link href="/library" className="hover:text-ink">Library</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <HeaderSearch />
          <ThemeToggle />
          <Button variant="primary" asChild>
            <Link href="/demo">
              Start a board <Icon name="arrow-right" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function CreditList({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  const credits = [...new Map(Object.values(ditherAssets).map((c) => [c.credit, c])).values()];
  return (
    <ul className={cn("columns-1 gap-6 text-xs sm:columns-2", className)}>
      {credits.map((c) => (
        <li key={c.credit} className="mb-1.5 break-inside-avoid">
          <a href={c.href} className={cn("underline underline-offset-2", linkClassName)}>
            {c.credit}
          </a>{" "}
          <span className="opacity-70">· {c.license}</span>
        </li>
      ))}
    </ul>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="strata h-4" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_2fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-sm text-ink-2">
            Acta, Latin for “things done.” A project manager for small teams, built in layers.
          </p>
        </div>
        <div id="credits">
          <p className="font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">Image credits</p>
          <CreditList className="mt-3 text-ink-2" linkClassName="decoration-line-strong hover:text-ink" />
        </div>
      </div>
    </footer>
  );
}
