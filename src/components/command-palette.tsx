"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { useTheme } from "next-themes";
import { Icon, type IconName } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/badge";
import { DitherFill } from "@/components/ui/dither";
import { openAppearance } from "@/lib/appearance";

const groupClass =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-ink-3";

const groups: { heading: string; items: { label: string; icon: IconName; keys?: string[] }[] }[] = [
  {
    heading: "Create",
    items: [
      { label: "New task", icon: "plus", keys: ["C"] },
      { label: "New board", icon: "board", keys: ["B"] },
      { label: "Invite to workspace", icon: "users" },
    ],
  },
  {
    heading: "Go to",
    items: [
      { label: "Portfolio site · Board", icon: "board", keys: ["G", "B"] },
      { label: "Portfolio site · Table", icon: "table", keys: ["G", "T"] },
      { label: "Inbox", icon: "inbox", keys: ["G", "I"] },
      { label: "Workspace settings", icon: "settings" },
    ],
  },
];

export function CommandPalette({ trigger }: { trigger?: (open: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {trigger?.(() => setOpen(true))}
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-ink/15" />
          <D.Content className="fixed top-[18vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 focus:outline-none">
            <D.Title className="sr-only">Command palette</D.Title>
            <div className="relative isolate">
              <DitherFill level={50} className="absolute inset-0 -z-10 translate-x-2 translate-y-2" />
              <Command className="border border-line-strong bg-raised" loop>
                <div className="flex items-center gap-2 border-b border-line px-3">
                  <Icon name="search" className="text-ink-3" />
                  <Command.Input
                    autoFocus
                    placeholder="Search or run a command"
                    className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
                  />
                  <Kbd>esc</Kbd>
                </div>
                <Command.List className="max-h-80 overflow-y-auto p-1">
                  <Command.Empty className="px-3 py-8 text-center text-sm text-ink-3">
                    No matches. Try a board or task name.
                  </Command.Empty>
                  {groups.map((g) => (
                    <Command.Group
                      key={g.heading}
                      heading={g.heading}
                      className={groupClass}
                    >
                      {g.items.map((item) => (
                        <PaletteItem key={item.label} onSelect={() => setOpen(false)} {...item} />
                      ))}
                    </Command.Group>
                  ))}
                  <Command.Group
                    heading="Preferences"
                    className={groupClass}
                  >
                    <PaletteItem
                      label={resolvedTheme === "dark" ? "Switch to stone (light)" : "Switch to basalt (dark)"}
                      icon={resolvedTheme === "dark" ? "sun" : "moon"}
                      onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                    />
                    <PaletteItem
                      label="Appearance…"
                      icon="palette"
                      onSelect={() => {
                        setOpen(false);
                        requestAnimationFrame(openAppearance);
                      }}
                    />
                  </Command.Group>
                </Command.List>
              </Command>
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}

function PaletteItem({
  label,
  icon,
  keys,
  onSelect,
}: {
  label: string;
  icon: IconName;
  keys?: string[];
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center gap-2.5 px-2 text-sm text-ink data-[selected=true]:bg-lapis-soft data-[selected=true]:text-lapis-ink"
    >
      <Icon name={icon} className="text-ink-3" />
      <span className="flex-1">{label}</span>
      {keys ? (
        <span className="flex gap-1">
          {keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      ) : null}
    </Command.Item>
  );
}
