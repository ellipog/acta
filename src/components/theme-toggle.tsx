"use client";

import { Icon } from "@/components/ui/icons";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The label is plain CSS rather than the tooltip component, so pages with no other tooltips don't download one.
// It lines up with the button's right edge because the toggle always sits at the end of a row
export function ThemeToggle({ side = "bottom" }: { side?: "top" | "bottom" }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <span className="group relative inline-flex">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <Icon name="sun" className="hidden dark:block" />
        <Icon name="moon" className="dark:hidden" />
      </Button>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-0 z-50 flex items-end opacity-0 transition-opacity group-hover:opacity-100 group-hover:delay-300 group-has-[:focus-visible]:opacity-100",
          side === "bottom" ? "top-full mt-1 flex-col-reverse" : "bottom-full mb-1 flex-col",
        )}
      >
        <span className="bg-ink px-2 py-1 text-xs whitespace-nowrap text-page">
          <span className="dark:hidden">Switch to basalt</span>
          <span className="hidden dark:inline">Switch to stone</span>
        </span>
        <svg
          viewBox="0 0 7 4"
          width={7}
          height={4}
          shapeRendering="crispEdges"
          className={cn("mr-[14.5px] fill-ink", side === "bottom" && "rotate-180")}
        >
          <path d="M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v1H3z" />
        </svg>
      </span>
    </span>
  );
}
