"use client";

import { Icon } from "@/components/ui/icons";
import { pixelBox } from "@/lib/pixel";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { openAppearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";

// The label is plain CSS rather than the tooltip component, so pages with no other tooltips don't download one.
// It lines up with the button's right edge because these buttons always sit at the end of a row
function Hinted({
  side,
  label,
  children,
}: {
  side: "top" | "bottom";
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-0 z-50 flex items-end opacity-0 transition-opacity group-hover:opacity-100 group-hover:delay-300 group-has-[:focus-visible]:opacity-100",
          side === "bottom" ? "top-full mt-1 flex-col-reverse" : "bottom-full mb-1 flex-col",
        )}
      >
        <span className="bg-ink px-2 py-1 text-xs whitespace-nowrap text-page">{label}</span>
        <svg
          viewBox="0 0 7 4"
          width={7}
          height={4}
          shapeRendering="crispEdges"
          style={pixelBox(7, 4, 1)}
          className={cn("pixel mr-[14.5px] fill-ink", side === "bottom" && "rotate-180")}
        >
          <path d="M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v1H3z" />
        </svg>
      </span>
    </span>
  );
}

export function ThemeToggle({ side = "bottom" }: { side?: "top" | "bottom" }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Hinted
      side={side}
      label={
        <>
          <span className="dark:hidden">Switch to basalt</span>
          <span className="hidden dark:inline">Switch to stone</span>
        </>
      }
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <Icon name="sun" className="hidden dark:block" />
        <Icon name="moon" className="dark:hidden" />
      </Button>
    </Hinted>
  );
}

/** Opens the Appearance panel: accent, surfaces, contrast, text size, font and motion */
export function AppearanceButton({ side = "bottom" }: { side?: "top" | "bottom" }) {
  return (
    <Hinted side={side} label="Appearance">
      <Button variant="ghost" size="icon" aria-label="Appearance" onClick={openAppearance}>
        <Icon name="palette" />
      </Button>
    </Hinted>
  );
}

/** The theme switch with the Appearance button before it, for the ends of headers and sidebars */
export function ThemeControls({ side = "bottom" }: { side?: "top" | "bottom" }) {
  return (
    <span className="flex items-center">
      <AppearanceButton side={side} />
      <ThemeToggle side={side} />
    </span>
  );
}
