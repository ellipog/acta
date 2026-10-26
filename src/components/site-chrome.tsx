import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountButton, HeaderCta } from "@/components/account-button";
import { LogoMark } from "@/components/ui/logo-mark";
import { ditherAssets } from "@/lib/dither-assets";
import { actaRoadmapHref } from "@/lib/slugs";
import { cn } from "@/lib/utils";

export { LogoMark };

export function Wordmark({ className = "", href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark />
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
          <nav aria-label="Legal" className="mt-6 flex gap-4 text-xs text-ink-3">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </nav>
        </div>
        <div id="credits">
          <p className="font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">Image credits</p>
          <CreditList className="mt-3 text-ink-2" linkClassName="decoration-line-strong hover:text-ink" />
        </div>
      </div>
    </footer>
  );
}
