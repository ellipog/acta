"use client";

import { Icon } from "@/components/ui/icons";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/overlays";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <Tooltip content={next === "dark" ? "Switch to basalt" : "Switch to stone"}>
      <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(next)}>
        <Icon name="sun" className="hidden dark:block" />
        <Icon name="moon" className="dark:hidden" />
      </Button>
    </Tooltip>
  );
}
